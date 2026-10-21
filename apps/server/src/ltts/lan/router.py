# SPDX-License-Identifier: MIT
# Copyright (c) 2026 Carson McRae
"""Purpose: HTTP endpoints for LAN mode.

Scope: From this computer: read LAN mode's state, turn it on (choosing an address) or off, show a new
pairing code and its QR code, cancel it, and remove one paired device or all of them. From a device on
the network: pair with a code (setting its device cookie) and ask whether it is paired. Which side may
call what is enforced by ``security.py`` with ``policy.py``.
Does NOT belong: Pairing rules or listening (``devices.py``, ``listener.py``).
"""

from __future__ import annotations

from typing import Annotated

from fastapi import APIRouter, Path, Request, Response
from pydantic import Field

from ltts.common import ApiModel
from ltts.container import ServicesDep
from ltts.errors import ConflictError
from ltts.lan.devices import DeviceOut, PairingOut
from ltts.lan.service import COOKIE, COOKIE_MAX_AGE_S, LanStatus

router = APIRouter(prefix="/api/lan", tags=["lan"])
DeviceId = Annotated[str, Path(pattern=r"^[0-9a-f]{32}$")]


class LanUpdate(ApiModel):
    enabled: bool
    address: str | None = Field(default=None, max_length=45)


class PairRequest(ApiModel):
    code: str = Field(min_length=4, max_length=20)
    name: str = Field(default="Phone or tablet", min_length=1, max_length=60)


class ThisDevice(ApiModel):
    paired: bool
    name: str | None = None


@router.get("")
def lan_status(services: ServicesDep) -> LanStatus:
    return services.lan.status()


@router.put("")
async def update_lan(body: LanUpdate, request: Request, services: ServicesDep) -> LanStatus:
    """Turn LAN mode on (on the main server's port) or off; turning it off stops listening at once."""
    if not body.enabled:
        return await services.lan.disable()
    port = request.scope["server"][1] if request.scope.get("server") else 8765
    return await services.lan.enable(body.address, int(port))


@router.post("/pairing")
def new_pairing_code(services: ServicesDep) -> PairingOut:
    return services.lan.new_code()


@router.delete("/pairing", status_code=204)
def cancel_pairing_code(services: ServicesDep) -> Response:
    services.lan.codes.cancel()
    return Response(status_code=204)


@router.get("/pairing/qr.svg", response_class=Response, responses={200: {"content": {"image/svg+xml": {}}}})
def pairing_qr(services: ServicesDep) -> Response:
    return Response(services.lan.qr_svg(), media_type="image/svg+xml", headers={"Cache-Control": "no-store"})


@router.delete("/devices/{device_id}", status_code=204)
def remove_device(device_id: DeviceId, services: ServicesDep) -> Response:
    services.lan.devices.remove(device_id)
    return Response(status_code=204)


@router.delete("/devices", status_code=204)
def remove_all_devices(services: ServicesDep) -> Response:
    services.lan.devices.remove_all()
    return Response(status_code=204)


@router.post("/pair", status_code=201)
def pair_device(body: PairRequest, request: Request, response: Response, services: ServicesDep) -> DeviceOut:
    """Pair the device making the request (on the network) with the code shown on the computer."""
    if not services.lan.serving(request.scope):
        raise ConflictError("Pair from the phone or tablet, using the address shown on the computer.", code="not_lan")
    address = request.client.host if request.client else "unknown"
    device, token = services.lan.pair(body.code, body.name.strip(), address)
    response.set_cookie(COOKIE, token, max_age=COOKIE_MAX_AGE_S, path="/", httponly=True, samesite="strict")
    return device


@router.get("/device")
def this_device(request: Request) -> ThisDevice:
    device: DeviceOut | None = getattr(request.state, "lan_device", None)
    return ThisDevice(paired=device is not None, name=device.name if device else None)
