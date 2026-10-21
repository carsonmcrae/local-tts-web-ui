# SPDX-License-Identifier: MIT
# Copyright (c) 2026 Carson McRae
"""Purpose: Tests for organising the library: folders, collections, genres, types, tags and favourites.

Scope: Folders (create, nest, rename, move, cycles and depth refused, delete keeps and moves documents,
limits), collections (several per document, members added and removed, delete keeps documents),
a document's shelf (favourite, type, genres, tags matched without regard to case, limits), organising
many documents at once, the facets, author and cover the library listing carries, what a paired
device may reach, and that migration 14 leaves a version-13 database's documents, progress, bookmarks
and styling exactly as they were.
Does NOT belong: The bundled catalog (test_library_catalog.py) or document extraction.
"""

from __future__ import annotations

import sqlite3
from pathlib import Path
from typing import Any

import pytest
from fastapi.testclient import TestClient

from conftest import FakeEngine
from ltts.app import create_app
from ltts.config import Settings
from ltts.container import Services, build_services
from ltts.db import MIGRATIONS, Database
from ltts.documents import collections, folders, shelf
from ltts.documents.shelf import clean_tags, tag_key

PNG = b"\x89PNG\r\n\x1a\n" + b"\0" * 32


def error(response: Any) -> str:
    code: str = response.json()["error"]["code"]
    return code


def document(client: TestClient, title: str = "A Book") -> str:
    doc_id: str = client.post("/api/documents/text", json={"text": f"{title}. One. Two.", "title": title}).json()["id"]
    return doc_id


def folder(client: TestClient, name: str, parent: str | None = None) -> dict[str, Any]:
    response = client.post("/api/library/folders", json={"name": name, "parentId": parent})
    assert response.status_code == 201, response.text
    created: dict[str, Any] = response.json()
    return created


def shelf_of(client: TestClient, doc_id: str) -> dict[str, Any]:
    facets: dict[str, Any] = next(d for d in client.get("/api/documents").json() if d["id"] == doc_id)["shelf"]
    return facets


# -- folders -------------------------------------------------------------------


def test_folders_nest_rename_move_and_list_with_counts(client: TestClient) -> None:
    doc = document(client)
    top = folder(client, "  Fiction  ")
    assert top["name"] == "Fiction" and top["parentId"] is None and top["position"] == 1
    inner = folder(client, "Fantasy", top["id"])
    other = folder(client, "Work")
    client.put(f"/api/documents/{doc}/shelf", json={"folderId": inner["id"]})
    listed = {f["id"]: f for f in client.get("/api/library/folders").json()}
    assert listed[inner["id"]]["documentCount"] == 1 and listed[top["id"]]["documentCount"] == 0
    assert [f["name"] for f in client.get("/api/library/folders").json()] == ["Fiction", "Work", "Fantasy"]

    renamed = client.patch(f"/api/library/folders/{inner['id']}", json={"name": "Fantasy & Myth"}).json()
    assert renamed["name"] == "Fantasy & Myth"
    moved = client.patch(f"/api/library/folders/{inner['id']}", json={"parentId": other["id"]}).json()
    assert moved["parentId"] == other["id"] and moved["position"] == 1
    to_top = client.patch(f"/api/library/folders/{inner['id']}", json={"parentId": None}).json()
    assert to_top["parentId"] is None and to_top["position"] == 3
    assert error(client.patch(f"/api/library/folders/{inner['id']}", json={"name": "   "})) == "invalid_folder_name"
    missing = "0" * 32
    assert error(client.patch(f"/api/library/folders/{missing}", json={"name": "x"})) == "folder_not_found"
    assert error(client.post("/api/library/folders", json={"name": "x", "parentId": missing})) == "folder_not_found"
    assert error(client.delete(f"/api/library/folders/{missing}")) == "folder_not_found"
    assert client.post("/api/library/folders", json={"name": "x", "parentId": "not-an-id"}).status_code == 422


def test_a_folder_never_moves_into_itself_or_too_deep(client: TestClient, services: Services) -> None:
    chain = [folder(client, "Level 1")]
    for level in range(2, folders.MAX_DEPTH + 1):
        chain.append(folder(client, f"Level {level}", chain[-1]["id"]))
    assert error(client.post("/api/library/folders", json={"name": "Too deep", "parentId": chain[-1]["id"]})) == (
        "folder_depth"
    )
    root, child = chain[0], chain[1]
    assert error(client.patch(f"/api/library/folders/{root['id']}", json={"parentId": child["id"]})) == "folder_cycle"
    assert error(client.patch(f"/api/library/folders/{root['id']}", json={"parentId": root["id"]})) == "folder_cycle"
    loose = folder(client, "Loose")
    assert error(client.patch(f"/api/library/folders/{loose['id']}", json={"parentId": chain[-1]["id"]})) == (
        "folder_depth"
    )
    # Moving a subtree counts its own height: a folder with one subfolder fits under level 6, not level 7.
    folder(client, "Loose child", loose["id"])
    assert error(client.patch(f"/api/library/folders/{loose['id']}", json={"parentId": chain[6]["id"]})) == (
        "folder_depth"
    )
    assert client.patch(f"/api/library/folders/{loose['id']}", json={"parentId": chain[5]["id"]}).status_code == 200
    with pytest.raises(folders.NotFoundError):
        folders.FolderStore(services.db).get("0" * 32)


def test_deleting_a_folder_moves_its_documents_up_and_never_deletes_them(client: TestClient) -> None:
    top, mid = folder(client, "Top"), None
    mid = folder(client, "Mid", top["id"])
    leaf = folder(client, "Leaf", mid["id"])
    in_mid, in_leaf, elsewhere = document(client, "In mid"), document(client, "In leaf"), document(client, "Elsewhere")
    client.put(f"/api/documents/{in_mid}/shelf", json={"folderId": mid["id"]})
    client.put(f"/api/documents/{in_leaf}/shelf", json={"folderId": leaf["id"]})
    assert client.delete(f"/api/library/folders/{mid['id']}").status_code == 204
    ids = {f["id"] for f in client.get("/api/library/folders").json()}
    assert ids == {top["id"]}  # the subfolder went with it
    assert shelf_of(client, in_mid)["folderId"] == top["id"]
    assert shelf_of(client, in_leaf)["folderId"] == top["id"]
    assert shelf_of(client, elsewhere)["folderId"] is None
    assert len(client.get("/api/documents").json()) == 3
    assert client.delete(f"/api/library/folders/{top['id']}").status_code == 204
    assert shelf_of(client, in_leaf)["folderId"] is None


def test_folder_limit(client: TestClient, monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(folders, "MAX_FOLDERS", 1)
    folder(client, "Only one")
    assert error(client.post("/api/library/folders", json={"name": "Two"})) == "folder_limit"


# -- collections -------------------------------------------------------------------


def test_collections_group_documents_without_copying_them(client: TestClient, services: Services) -> None:
    first, second = document(client, "First"), document(client, "Second")
    evening = client.post("/api/library/collections", json={"name": " Evening listening ", "description": "x\n\ny"})
    assert evening.status_code == 201
    evening_id = evening.json()["id"]
    assert evening.json()["name"] == "Evening listening" and evening.json()["description"] == "x y"
    favourites = client.post("/api/library/collections", json={"name": "Favourite fantasy"}).json()["id"]
    members = client.post(
        f"/api/library/collections/{evening_id}/documents", json={"add": [first, second, first], "remove": []}
    ).json()
    assert members["documentCount"] == 2
    client.post(f"/api/library/collections/{favourites}/documents", json={"add": [first]})
    assert shelf_of(client, first)["collectionIds"] == [evening_id, favourites]
    assert shelf_of(client, second)["collectionIds"] == [evening_id]
    removed = client.post(f"/api/library/collections/{evening_id}/documents", json={"remove": [second]}).json()
    assert removed["documentCount"] == 1 and shelf_of(client, second)["collectionIds"] == []
    changed = client.patch(f"/api/library/collections/{evening_id}", json={"name": "Nights", "description": ""}).json()
    assert (changed["name"], changed["description"]) == ("Nights", "")
    described = client.patch(f"/api/library/collections/{evening_id}", json={"description": "Late"}).json()
    assert (described["name"], described["description"]) == ("Nights", "Late")
    renamed = client.patch(f"/api/library/collections/{evening_id}", json={"name": "Late nights"}).json()
    assert (renamed["name"], renamed["description"]) == ("Late nights", "Late")
    assert error(client.patch(f"/api/library/collections/{evening_id}", json={"name": " "})) == (
        "invalid_collection_name"
    )
    listed = client.get("/api/library/collections").json()
    assert [c["name"] for c in listed] == ["Late nights", "Favourite fantasy"]
    assert client.delete(f"/api/library/collections/{evening_id}").status_code == 204
    assert shelf_of(client, first)["collectionIds"] == [favourites]
    assert len(client.get("/api/documents").json()) == 2  # nothing deleted with the collection
    missing = "0" * 32
    assert error(client.delete(f"/api/library/collections/{missing}")) == "collection_not_found"
    assert error(client.patch(f"/api/library/collections/{missing}", json={"name": "x"})) == "collection_not_found"
    assert error(client.post(f"/api/library/collections/{favourites}/documents", json={"add": [missing]})) == (
        "document_not_found"
    )
    with pytest.raises(collections.NotFoundError):
        collections.CollectionStore(services.db).get(missing)


def test_collection_limit(client: TestClient, monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(collections, "MAX_COLLECTIONS", 1)
    assert client.post("/api/library/collections", json={"name": "One"}).status_code == 201
    assert error(client.post("/api/library/collections", json={"name": "Two"})) == "collection_limit"


# -- a document's shelf -------------------------------------------------------------------


def test_shelf_fields_are_kept_unless_sent(client: TestClient, services: Services) -> None:
    doc = document(client)
    assert shelf_of(client, doc) == {
        "folderId": None, "favorite": False, "documentType": None, "genres": [], "tags": [], "collectionIds": [],
    }  # fmt: skip
    first = client.put(
        f"/api/documents/{doc}/shelf",
        json={
            "favorite": True,
            "documentType": "novel",
            "genres": ["fantasy", "adventure"],
            "tags": ["Fun", "fun ", "Evening"],
        },
    )
    assert first.status_code == 200
    facets = first.json()["shelf"]
    assert facets["favorite"] and facets["documentType"] == "novel"
    assert facets["genres"] == ["adventure", "fantasy"] and facets["tags"] == ["Evening", "Fun"]
    second = client.put(f"/api/documents/{doc}/shelf", json={"documentType": None}).json()["shelf"]
    assert second["documentType"] is None and second["favorite"] and second["tags"] == ["Evening", "Fun"]
    third = client.put(f"/api/documents/{doc}/shelf", json={"tags": [], "favorite": False}).json()["shelf"]
    assert third["tags"] == [] and not third["favorite"] and third["genres"] == ["adventure", "fantasy"]
    assert client.put(f"/api/documents/{doc}/shelf", json={"genres": ["western"]}).status_code == 422
    assert client.put(f"/api/documents/{doc}/shelf", json={"documentType": "pamphlet"}).status_code == 422
    assert client.put(f"/api/documents/{doc}/shelf", json={"tags": ["x" * 41]}).status_code == 422
    assert client.put(f"/api/documents/{doc}/shelf", json={"tags": ["  "]}).status_code == 422
    assert error(client.put(f"/api/documents/{'0' * 32}/shelf", json={"favorite": True})) == "document_not_found"
    # Changing the shelf doesn't count as opening the document.
    with sqlite3.connect(services.settings.database_path) as conn:
        conn.execute("UPDATE documents SET last_opened_at = '2026-01-01T00:00:00+00:00'")
    assert client.put(f"/api/documents/{doc}/shelf", json={"favorite": True}).json()["lastOpenedAt"] == (
        "2026-01-01T00:00:00+00:00"
    )


def test_tags_match_without_regard_to_case_and_are_limited(client: TestClient) -> None:
    first, second = document(client, "First"), document(client, "Second")
    client.put(f"/api/documents/{first}/shelf", json={"tags": ["Poetry", "Evening"]})
    client.put(f"/api/documents/{second}/shelf", json={"tags": ["poetry", "Morning"]})
    assert client.get("/api/library/tags").json() == [
        {"tag": "Poetry", "count": 2},
        {"tag": "Evening", "count": 1},
        {"tag": "Morning", "count": 1},
    ]
    assert clean_tags(["a", "A", " a  b ", "\x07b\x07"]) == ["a", "a b", "b"]
    assert tag_key("  Science\tFiction ") == "science fiction"
    with pytest.raises(ValueError, match="1 to 40"):
        clean_tags([""])
    many = [f"tag {n}" for n in range(shelf.MAX_TAGS)]
    assert client.put(f"/api/documents/{first}/shelf", json={"tags": many}).status_code == 200
    assert error(client.post("/api/library/organize", json={"documentIds": [first], "addTags": ["one more"]})) == (
        "tag_limit"
    )
    assert client.put(f"/api/documents/{first}/shelf", json={"tags": [*many, "x"]}).status_code == 422


def test_organizing_many_documents_at_once(client: TestClient) -> None:
    docs = [document(client, f"Book {n}") for n in range(3)]
    shelf_folder = folder(client, "Shelf")
    reading = client.post("/api/library/collections", json={"name": "Reading"}).json()["id"]
    done = client.post("/api/library/collections", json={"name": "Done"}).json()["id"]
    client.post(f"/api/library/collections/{done}/documents", json={"add": docs[:2]})
    answer = client.post(
        "/api/library/organize",
        json={
            "documentIds": [docs[0], docs[1], docs[0]],
            "folderId": shelf_folder["id"],
            "favorite": True,
            "documentType": "short-story",
            "genres": ["mystery"],
            "addTags": ["Holmes", "Classic"],
            "addToCollections": [reading],
            "removeFromCollections": [done],
        },
    )
    assert answer.status_code == 200, answer.text
    assert [d["id"] for d in answer.json()] == [docs[0], docs[1]]
    for doc in docs[:2]:
        facets = shelf_of(client, doc)
        assert facets == {
            "folderId": shelf_folder["id"], "favorite": True, "documentType": "short-story", "genres": ["mystery"],
            "tags": ["Classic", "Holmes"], "collectionIds": [reading],
        }  # fmt: skip
    assert shelf_of(client, docs[2]) == {
        "folderId": None, "favorite": False, "documentType": None, "genres": [], "tags": [], "collectionIds": [],
    }  # fmt: skip
    later = client.post(
        "/api/library/organize",
        json={
            "documentIds": docs[:1],
            "folderId": None,
            "favorite": False,
            "removeTags": ["holmes"],
            "documentType": None,
        },
    ).json()[0]["shelf"]
    assert later == {
        "folderId": None, "favorite": False, "documentType": None, "genres": ["mystery"], "tags": ["Classic"],
        "collectionIds": [reading],
    }  # fmt: skip
    missing = "0" * 32
    assert error(client.post("/api/library/organize", json={"documentIds": [docs[0], missing]})) == "document_not_found"
    assert error(client.post("/api/library/organize", json={"documentIds": docs[:1], "folderId": missing})) == (
        "folder_not_found"
    )
    assert error(
        client.post("/api/library/organize", json={"documentIds": docs[:1], "addToCollections": [missing]})
    ) == ("collection_not_found")
    assert client.post("/api/library/organize", json={"documentIds": ["nope"]}).status_code == 422
    assert client.post("/api/library/organize", json={"documentIds": []}).status_code == 422


def test_the_listing_carries_author_and_cover(client: TestClient) -> None:
    doc = document(client)
    before = client.get("/api/documents").json()[0]
    assert before["author"] is None and before["hasCover"] is False
    client.put(f"/api/documents/{doc}/details", json={"author": "Lewis Carroll"})
    client.put(f"/api/documents/{doc}/cover", content=PNG)
    after = client.get(f"/api/documents/{doc}").json()
    assert after["author"] == "Lewis Carroll" and after["hasCover"] is True
    assert client.get("/api/documents").json()[0]["hasCover"] is True
    client.delete(f"/api/documents/{doc}")
    assert client.get("/api/documents").json() == []
    assert client.get("/api/library/tags").json() == []


# -- migration -------------------------------------------------------------------


def _version_13_database(path: Path) -> None:
    """A database exactly as version 2.0 left it, with a document, its progress, a bookmark and styling."""
    with sqlite3.connect(path) as conn:
        for number, script in enumerate(MIGRATIONS[:13], start=1):
            conn.executescript(f"BEGIN; {script}; PRAGMA user_version = {number}; COMMIT;")
        conn.execute(
            "INSERT INTO documents VALUES ('d' * 1, 'Old Book', 'old.txt', 'txt', 10, 20, 4, NULL, 2, "
            '\'[{"index": 0, "title": "Old Book", "start_segment": 0, "segment_count": 2, "page": null}]\', '
            "'[]', 'abc', '2026-01-01T00:00:00+00:00', NULL)".replace("'d' * 1", f"'{'d' * 32}'")
        )
        conn.executemany(
            "INSERT INTO segments VALUES (?, ?, 0, ?, 'paragraph', ?, ?)",
            [("d" * 32, 0, 0, "sentence", "One."), ("d" * 32, 1, 0, "section", "Two.")],
        )
        conn.execute("INSERT INTO progress VALUES (?, 1, 'kokoro:alpha', '2026-01-02T00:00:00+00:00')", ("d" * 32,))
        conn.execute(
            "INSERT INTO bookmarks VALUES (?, ?, 1, 'note', '2026-01-02T00:00:00+00:00')", ("b" * 32, "d" * 32)
        )
        conn.execute("INSERT INTO segment_annotations VALUES (?, 0, 'voice', 'kokoro:alpha')", ("d" * 32,))


def test_migration_14_keeps_every_existing_row(tmp_path: Path, engines: dict[str, FakeEngine]) -> None:
    settings = Settings(
        env="test", data_dir=tmp_path / "data", models_dir=tmp_path / "models", warm_up_engines=False,
        extra_allowed_hosts=["testserver"],
    )  # fmt: skip
    settings.path()
    _version_13_database(settings.database_path)
    assert sqlite3.connect(settings.database_path).execute("PRAGMA user_version").fetchone()[0] == 13
    services = build_services(settings, isolate_extraction=False, engine_factory=lambda _s, _m: list(engines.values()))
    assert sqlite3.connect(settings.database_path).execute("PRAGMA user_version").fetchone()[0] == len(MIGRATIONS)
    with TestClient(create_app(settings, services=services), headers={"X-LTTS-Client": "web"}) as client:
        [doc] = client.get("/api/documents").json()
        assert doc["id"] == "d" * 32 and doc["title"] == "Old Book" and doc["progress"]["segmentIndex"] == 1
        assert doc["shelf"]["favorite"] is False and doc["shelf"]["tags"] == []
        assert [b["note"] for b in client.get(f"/api/documents/{doc['id']}/bookmarks").json()] == ["note"]
        assert client.get(f"/api/documents/{doc['id']}/styles").json()["segments"][0]["voiceId"] == "kokoro:alpha"
        client.put(f"/api/documents/{doc['id']}/shelf", json={"favorite": True})
        assert client.get("/api/documents").json()[0]["shelf"]["favorite"] is True
    # Running the migrations again (another branch's copy of the same migration) is harmless.
    Database(settings.database_path).migrate()


def test_the_vocabularies_are_the_documented_ones() -> None:
    assert "fantasy" in shelf.GENRES and "childrens" in shelf.GENRES and len(shelf.GENRES) == 17
    assert "short-story-collection" in shelf.WORK_TYPES and len(shelf.WORK_TYPES) == 13
