# SPDX-License-Identifier: MIT
# Copyright (c) 2026 Carson McRae
"""Purpose: HTTP endpoints for organising the library: folders, collections, tags and a document's shelf.

Scope: List, create, rename, move and delete folders; list, create, change and delete collections and
set their members; list the tags in use; change one document's folder, favourite, type, genres and
tags; and organise many documents in one request. Answers carry the updated library summaries so the
browser can replace what it shows without refetching the whole list.
Does NOT belong: The rules (``folders.py``, ``collections.py``, ``shelf.py``) or the documents themselves.
"""

from __future__ import annotations

from typing import Annotated

from fastapi import APIRouter, Path, Response

from ltts.container import ServicesDep
from ltts.documents.collections import CollectionIn, CollectionMembers, CollectionOut, CollectionUpdate
from ltts.documents.folders import FolderIn, FolderOut, FolderUpdate
from ltts.documents.schemas import DocumentSummary
from ltts.documents.shelf import ID_PATTERN, OrganizeRequest, ShelfUpdate, TagOut

router = APIRouter(prefix="/api", tags=["library"])
DocumentId = Annotated[str, Path(pattern=ID_PATTERN)]
FolderId = Annotated[str, Path(pattern=ID_PATTERN)]
CollectionId = Annotated[str, Path(pattern=ID_PATTERN)]


@router.get("/library/folders")
def list_folders(services: ServicesDep) -> list[FolderOut]:
    return services.folders.list_all()


@router.post("/library/folders", status_code=201)
def create_folder(body: FolderIn, services: ServicesDep) -> FolderOut:
    return services.folders.create(body)


@router.patch("/library/folders/{folder_id}")
def update_folder(folder_id: FolderId, body: FolderUpdate, services: ServicesDep) -> FolderOut:
    """Rename a folder and/or move it (``parentId`` null puts it at the top level)."""
    return services.folders.update(folder_id, body)


@router.delete("/library/folders/{folder_id}", status_code=204)
def delete_folder(folder_id: FolderId, services: ServicesDep) -> Response:
    """Delete a folder and the folders inside it; their documents move to the folder above."""
    services.folders.delete(folder_id)
    return Response(status_code=204)


@router.get("/library/collections")
def list_collections(services: ServicesDep) -> list[CollectionOut]:
    return services.collections.list_all()


@router.post("/library/collections", status_code=201)
def create_collection(body: CollectionIn, services: ServicesDep) -> CollectionOut:
    return services.collections.create(body)


@router.patch("/library/collections/{collection_id}")
def update_collection(collection_id: CollectionId, body: CollectionUpdate, services: ServicesDep) -> CollectionOut:
    return services.collections.update(collection_id, body)


@router.delete("/library/collections/{collection_id}", status_code=204)
def delete_collection(collection_id: CollectionId, services: ServicesDep) -> Response:
    """Delete a collection; the documents in it are untouched."""
    services.collections.delete(collection_id)
    return Response(status_code=204)


@router.post("/library/collections/{collection_id}/documents")
def set_collection_members(
    collection_id: CollectionId, body: CollectionMembers, services: ServicesDep
) -> CollectionOut:
    return services.collections.set_members(collection_id, body)


@router.get("/library/tags")
def list_tags(services: ServicesDep) -> list[TagOut]:
    return services.shelf.tags()


@router.put("/documents/{document_id}/shelf")
def update_shelf(document_id: DocumentId, body: ShelfUpdate, services: ServicesDep) -> DocumentSummary:
    """Set a document's folder, favourite, type, genres and tags (fields left out are kept)."""
    services.shelf.update(document_id, body)
    return services.document_repo.summary(document_id)


@router.post("/library/organize")
def organize_documents(body: OrganizeRequest, services: ServicesDep) -> list[DocumentSummary]:
    """Move, favourite, classify or tag several documents, and add them to or remove them from collections."""
    changed = services.shelf.organize(body)
    return [services.document_repo.summary(document_id) for document_id in changed]
