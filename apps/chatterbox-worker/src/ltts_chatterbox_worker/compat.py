"""Purpose: Compatibility shims for third-party packages the worker loads.

Scope: Provides ``pkg_resources.resource_filename`` for the Perth watermarker (imported by Chatterbox),
which still imports it although setuptools 81 and later no longer ship ``pkg_resources``. Only that one
function is provided, backed by ``importlib.resources``; a real ``pkg_resources``, if present, wins.
Does NOT belong: The JSON-lines protocol and model handling (``__main__``).
"""

from __future__ import annotations

# importlib.resources.files needs Python 3.9; this worker requires 3.11.
# nosemgrep: python.lang.compatibility.python37.python37-compatibility-importlib2
import importlib.resources
import importlib.util
import sys
import types


def resource_filename(package: str, resource: str) -> str:
    """Filesystem path of ``resource`` inside an installed (non-zipped) package."""
    return str(importlib.resources.files(package).joinpath(resource))


def install_pkg_resources_shim() -> bool:
    """Registers a minimal ``pkg_resources`` module unless a real one is importable.

    Returns True when the shim was installed.
    """
    if "pkg_resources" in sys.modules or importlib.util.find_spec("pkg_resources") is not None:
        return False
    shim = types.ModuleType("pkg_resources")
    shim.__dict__["resource_filename"] = resource_filename
    sys.modules["pkg_resources"] = shim
    return True
