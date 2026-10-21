# SPDX-License-Identifier: MIT
# Copyright (c) 2026 Carson McRae
"""Purpose: Whether the network LAN mode would open on is one the person trusts, before and while it is on.

Scope: On Windows, the category Windows gives the chosen adapter's network (Public, Private or
DomainAuthenticated), read with one read-only PowerShell command (``Get-NetConnectionProfile``) under
a time limit and matched to the adapter by name. Public is refused, with how to make a home network
Private in Windows Settings; so is a category that can't be read (no PowerShell, an error, a timeout,
output that doesn't parse, no profile for that adapter). macOS and Linux have no such category, so
the person confirms every time LAN mode is turned on that this is a home network they trust. The
command can be replaced for tests. Nothing here changes network, firewall or system settings.
Does NOT belong: Listing adapters (``network.py``) or turning LAN mode on and off (``service.py``).
"""

from __future__ import annotations

import json
import logging
import os
import subprocess
import sys
from collections.abc import Callable
from dataclasses import dataclass
from pathlib import Path
from typing import Literal

from ltts.errors import ConflictError

Check = Literal["category", "confirm"]  # Windows reads the network's category; elsewhere the person confirms
Category = Literal["private", "domain"]  # the categories LAN mode opens on
Reading = Literal["private", "domain", "public", "no_profile", "unreadable"]
Runner = Callable[[float], str]  # runs the query within the time limit and returns what it printed
TIMEOUT_S = 8.0  # it takes one to two seconds on an idle computer
# Read only: the network profiles, as JSON. PowerShell is told to write UTF-8, so adapter names in any
# language arrive intact; that setting lasts only as long as this one PowerShell process.
QUERY = (
    "[Console]::OutputEncoding = New-Object System.Text.UTF8Encoding $false; "
    "Get-NetConnectionProfile | Select-Object InterfaceAlias,InterfaceIndex,NetworkCategory,IPv4Connectivity "
    "| ConvertTo-Json -Compress"
)
# NetworkCategory as Windows PowerShell 5.1 writes it (a number), or as newer PowerShell may (a name).
_CATEGORIES: dict[int | str, Reading] = {
    0: "public", 1: "private", 2: "domain", "public": "public", "private": "private", "domainauthenticated": "domain",
}  # fmt: skip
_HOW_TO_MAKE_IT_PRIVATE = (
    "If this is your own home network, make it private in Windows: open Settings → Network & internet → "
    "Wi-Fi (or Ethernet), open this network's properties, and under Network profile type choose Private "
    "network. Then turn on LAN mode again. Leave networks in cafés, hotels, airports and offices public."
)
PUBLIC = (
    "Windows lists the network on {interface} as a public network, so LAN mode stays off: on a public network, "
    "devices you don't know could reach TTSNative. " + _HOW_TO_MAKE_IT_PRIVATE
)
NO_PROFILE = (
    "Windows doesn't list a network for {interface}, so TTSNative can't tell whether it's a private network, "
    "and LAN mode stays off. Check in Settings → Network & internet that this adapter is connected to your home "
    "network and that its network profile type is Private, or choose another network address."
)
UNREADABLE = (
    "TTSNative couldn't read whether Windows treats the network on {interface} as private or public, so LAN mode "
    "stays off. Try again in a moment. If it keeps happening, check in Settings → Network & internet that this "
    "network's profile type is Private."
)
CONFIRM = (
    "Confirm that this computer is on a home network you trust, such as your own Wi-Fi, before turning on LAN "
    "mode. Don't turn it on in cafés, hotels, airports or offices."
)
log = logging.getLogger("ltts.lan")


class QueryError(Exception):
    """The network query ran but failed."""


def powershell() -> str:
    """Windows PowerShell's own path, never one found on PATH."""
    root = os.environ.get("SYSTEMROOT") or r"C:\Windows"
    return str(Path(root, "System32", "WindowsPowerShell", "v1.0", "powershell.exe"))


def run_query(timeout: float) -> str:
    """Run the read-only query; raises OSError, subprocess.TimeoutExpired or QueryError."""
    done = subprocess.run(  # noqa: S603 - a fixed argument list and an absolute path, never a shell
        [powershell(), "-NoProfile", "-NonInteractive", "-Command", QUERY],
        capture_output=True, stdin=subprocess.DEVNULL, timeout=timeout, check=False,
        creationflags=getattr(subprocess, "CREATE_NO_WINDOW", 0),
    )  # fmt: skip
    if done.returncode != 0:
        raise QueryError(f"exit code {done.returncode}")
    return done.stdout.decode("utf-8", "replace")


@dataclass(frozen=True)
class Profile:
    interface: str  # InterfaceAlias: the adapter's name, as psutil gives it
    category: Reading | Literal["unknown"]


def parse_profiles(output: str) -> list[Profile]:
    """The profiles in the query's JSON (one object, or a list of them); raises ValueError when malformed."""
    text = output.lstrip("\ufeff").strip()
    if not text:
        return []
    data = json.loads(text)
    found = []
    for item in data if isinstance(data, list) else [data]:
        if not isinstance(item, dict) or not isinstance(item.get("InterfaceAlias"), str):
            raise ValueError("not a network profile")
        raw = item.get("NetworkCategory")
        key = raw.lower() if isinstance(raw, str) else raw if type(raw) is int else None  # never True or 1.0
        category = _CATEGORIES.get(key) if key is not None else None
        found.append(Profile(item["InterfaceAlias"], category or "unknown"))
    return found


def reading_for(interface: str, profiles: list[Profile]) -> Reading:
    """The category of ``interface``'s network; the strictest one if Windows lists it more than once."""
    categories = {profile.category for profile in profiles if profile.interface.casefold() == interface.casefold()}
    if not categories:
        return "no_profile"
    if "public" in categories:
        return "public"
    if "unknown" in categories:
        return "unreadable"
    return "domain" if categories == {"domain"} else "private"


@dataclass
class NetworkTrust:
    platform: str = sys.platform
    runner: Runner = run_query
    timeout: float = TIMEOUT_S

    @property
    def check(self) -> Check:
        return "category" if self.platform == "win32" else "confirm"

    def read(self, interface: str) -> Reading:
        """What Windows calls the network on ``interface`` (only ever read, never changed)."""
        try:
            return reading_for(interface, parse_profiles(self.runner(self.timeout)))
        except (OSError, subprocess.SubprocessError, QueryError, ValueError) as exc:
            log.warning("couldn't read the network category: %s", type(exc).__name__)
            return "unreadable"

    def require(self, interface: str, confirmed: bool) -> Category | None:
        """Raise unless LAN mode may open on ``interface``; returns Windows' category for it, when there is one."""
        if self.check == "confirm":
            if not confirmed:
                raise ConflictError(CONFIRM, code="lan_confirm_network")
            return None
        reading = self.read(interface)
        if reading in ("private", "domain"):
            return "domain" if reading == "domain" else "private"
        if reading == "public":
            raise ConflictError(PUBLIC.format(interface=interface), code="lan_public_network")
        message = NO_PROFILE if reading == "no_profile" else UNREADABLE
        details = {"reason": reading}
        raise ConflictError(message.format(interface=interface), code="lan_network_unknown", details=details)
