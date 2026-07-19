"""Auth: signup persists a real account, login verifies it, tokens gate /me."""

from __future__ import annotations


def test_signup_login_me_flow(client):
    # signup persists an account and returns a session token
    r = client.post("/api/auth/signup", json={
        "email": "founder@example.com", "password": "supersecret1",
        "display_name": "Fay Founder", "role": "founder",
    })
    assert r.status_code == 200
    body = r.json()
    token = body["token"]
    assert token
    assert body["account"]["email"] == "founder@example.com"
    assert body["account"]["role"] == "founder"

    # the token authenticates /me
    me = client.get("/api/auth/me", headers={"Authorization": f"Bearer {token}"})
    assert me.status_code == 200
    assert me.json()["account"]["display_name"] == "Fay Founder"

    # duplicate signup for the same email+role is rejected
    dup = client.post("/api/auth/signup", json={
        "email": "founder@example.com", "password": "supersecret1",
        "display_name": "Fay", "role": "founder",
    })
    assert dup.status_code == 409

    # login with the right password succeeds and issues a new token
    ok = client.post("/api/auth/login", json={
        "email": "founder@example.com", "password": "supersecret1", "role": "founder",
    })
    assert ok.status_code == 200
    assert ok.json()["account"]["id"] == body["account"]["id"]

    # wrong password is rejected
    bad = client.post("/api/auth/login", json={
        "email": "founder@example.com", "password": "wrongwrong", "role": "founder",
    })
    assert bad.status_code == 401


def test_me_requires_valid_token(client):
    assert client.get("/api/auth/me").status_code == 401
    assert client.get("/api/auth/me", headers={"Authorization": "Bearer nope"}).status_code == 401


def test_same_email_different_roles_allowed(client):
    a = client.post("/api/auth/signup", json={
        "email": "both@example.com", "password": "supersecret1",
        "display_name": "Both Investor", "role": "investor",
    })
    b = client.post("/api/auth/signup", json={
        "email": "both@example.com", "password": "supersecret1",
        "display_name": "Both Founder", "role": "founder",
    })
    assert a.status_code == 200
    assert b.status_code == 200
    assert a.json()["account"]["id"] != b.json()["account"]["id"]


def test_login_wrong_role_rejected(client):
    client.post("/api/auth/signup", json={
        "email": "investor@example.com", "password": "supersecret1",
        "display_name": "Ivy Investor", "role": "investor",
    })
    # right creds but wrong interface/role
    r = client.post("/api/auth/login", json={
        "email": "investor@example.com", "password": "supersecret1", "role": "founder",
    })
    assert r.status_code == 401
