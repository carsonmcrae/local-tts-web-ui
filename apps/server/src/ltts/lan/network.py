# SPDX-License-Identifier: MIT
# Copyright (c) 2026 Carson McRae
"""Purpose: This computer's network addresses a phone could reach, and what kind of adapter each is on.

Scope: Private IPv4 addresses (never public, loopback or link-local ones) on adapters that are up.
Adapters that only reach virtual machines or containers on this computer (WSL, Hyper-V's Default
Switch, Docker, VirtualBox and VMware host-only networks, libvirt) are left out: no phone is on them.
Other virtual adapters are kept but labelled, because some are the real network (a Hyper-V external
switch carries the computer's own connection; Windows' mobile hotspot is one too), and VPN or
overlay adapters are kept but labelled and listed last, because devices on them may be anywhere.
Detection goes by adapter name (and a single-address netmask, which tunnels use), so it is a best
effort: an unrecognised adapter is shown as an ordinary network.
Does NOT belong: Listening (``listener.py``) or deciding who may connect (``security.py``, ``policy.py``).
"""

from __future__ import annotations

import ipaddress
import re
import socket
from typing import Literal

import psutil

from ltts.common import ApiModel

Kind = Literal["network", "virtual", "vpn"]
_ORDER: dict[str, int] = {"network": 0, "virtual": 1, "vpn": 2}

# Only virtual machines or containers on this computer are on these: never a phone.
_INTERNAL = re.compile(
    r"^vEthernet \((Default Switch|WSL.*|nat|DockerNAT)\)$|VirtualBox Host-Only|^vboxnet\d"
    r"|^VMware Network Adapter VMnet\d|^vmnet\d|^docker\d|^br-[0-9a-f]{12}$|^virbr\d|^veth[0-9a-f]{4}|^lxcbr\d|^lxdbr\d"
    r"|^podman\d|^cni\d|^flannel|^Parallels (Host-Only|Shared)|^vnic\d",
    re.IGNORECASE,
)
# Virtual, but possibly the real network: a Hyper-V switch, Windows' hotspot, macOS sharing bridges.
_VIRTUAL = re.compile(r"^vEthernet \(|^Local Area Connection\* \d+$|^bridge\d+$", re.IGNORECASE)
_VPN = re.compile(
    r"tailscale|zerotier|^zt[0-9a-z]{6,}$|wireguard|^wg\d|nordlynx|openvpn|tap-windows|wintun|^tap\d|^tun\d"
    r"|^utun\d|^ppp\d|^ipsec|anyconnect|^cscotun|globalprotect|pangp|fortinet|forticlient|juniper|pulse secure"
    r"|proton|mullvad|expressvpn|surfshark|windscribe|hamachi|radmin|warp|\bvpn\b",
    re.IGNORECASE,
)


class NetworkAddress(ApiModel):
    address: str
    interface: str  # the adapter's name, such as "Wi-Fi" or "Ethernet"
    kind: Kind  # network: an ordinary adapter; virtual: may or may not be the real network; vpn: may reach anywhere


def adapter_kind(name: str, netmask: str | None = None) -> Kind | None:
    """What an adapter is, or None when no phone could be on it."""
    if _INTERNAL.search(name):
        return None
    if _VPN.search(name) or netmask == "255.255.255.255":
        return "vpn"
    return "virtual" if _VIRTUAL.search(name) else "network"


def _usable(raw: str) -> bool:
    try:
        address = ipaddress.ip_address(raw)
    except ValueError:
        return False
    return address.is_private and not (address.is_loopback or address.is_link_local or address.is_unspecified)


def network_addresses() -> list[NetworkAddress]:
    """This computer's private addresses a phone could reach: ordinary networks first, 192.168… first among them."""
    stats = psutil.net_if_stats()
    found: dict[str, NetworkAddress] = {}
    for name, entries in psutil.net_if_addrs().items():
        if name in stats and not stats[name].isup:
            continue
        for entry in entries:
            if entry.family != socket.AF_INET or not _usable(entry.address):
                continue
            kind = adapter_kind(name, entry.netmask)
            known = found.get(entry.address)
            if kind is not None and (known is None or _ORDER[kind] < _ORDER[known.kind]):
                found[entry.address] = NetworkAddress(address=entry.address, interface=name, kind=kind)
    return sorted(found.values(), key=_likeliest)


def _likeliest(choice: NetworkAddress) -> tuple[int, bool, bool, str]:
    address = choice.address
    return _ORDER[choice.kind], not address.startswith("192.168."), not address.startswith("10."), address
