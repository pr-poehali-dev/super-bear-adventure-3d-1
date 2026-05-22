"""
Онлайн кооператив: комнаты, синхронизация позиций, чат.
"""
import json
import os
import random
import string
import psycopg2

SCHEMA = os.environ.get("MAIN_DB_SCHEMA", "t_p74278794_super_bear_adventure")

def get_conn():
    return psycopg2.connect(os.environ["DATABASE_URL"])

def gen_code():
    return "".join(random.choices(string.ascii_uppercase + string.digits, k=6))

def cors():
    return {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
        "Access-Control-Allow-Headers": "Content-Type, X-Player-Id",
    }

def ok(data):
    return {"statusCode": 200, "headers": {**cors(), "Content-Type": "application/json"}, "body": json.dumps(data, ensure_ascii=False)}

def err(msg, code=400):
    return {"statusCode": code, "headers": {**cors(), "Content-Type": "application/json"}, "body": json.dumps({"error": msg})}

def handler(event: dict, context) -> dict:
    if event.get("httpMethod") == "OPTIONS":
        return {"statusCode": 200, "headers": cors(), "body": ""}

    method = event.get("httpMethod", "GET")
    qs = event.get("queryStringParameters") or {}
    action = qs.get("action", "")

    body = {}
    if event.get("body"):
        try:
            body = json.loads(event["body"])
        except Exception:
            pass

    headers_raw = event.get("headers") or {}
    player_id = (
        headers_raw.get("x-player-id")
        or headers_raw.get("X-Player-Id")
        or body.get("player_id", "")
    )

    conn = get_conn()
    cur = conn.cursor()

    try:
        # ── CREATE ROOM ───────────────────────────────────────────────────────
        if method == "POST" and action == "create":
            if not player_id:
                return err("player_id required")
            world_id   = body.get("world_id", 1)
            world_name = body.get("world_name", "Лесной мир")
            world_emoji= body.get("world_emoji", "🌲")

            cur.execute(f"UPDATE {SCHEMA}.rooms SET status='closed' WHERE host_id=%s AND status IN ('waiting','playing')", (player_id,))
            code = gen_code()
            cur.execute(
                f"INSERT INTO {SCHEMA}.rooms (code,host_id,world_id,world_name,world_emoji,status,host_x,host_y,guest_x,guest_y)"
                f" VALUES (%s,%s,%s,%s,%s,'waiting',0,1.5,2,1.5)",
                (code, player_id, world_id, world_name, world_emoji)
            )
            conn.commit()
            return ok({"code": code, "role": "host"})

        # ── JOIN ROOM ─────────────────────────────────────────────────────────
        elif method == "POST" and action == "join":
            if not player_id:
                return err("player_id required")
            code = body.get("code", "").upper().strip()
            if not code:
                return err("code required")

            cur.execute(f"SELECT id,host_id,guest_id,status,world_id,world_name,world_emoji FROM {SCHEMA}.rooms WHERE code=%s", (code,))
            row = cur.fetchone()
            if not row:
                return err("Комната не найдена")
            rid, host_id, guest_id, status, world_id, world_name, world_emoji = row
            if status != "waiting":
                return err("Комната уже занята или закрыта")
            if host_id == player_id:
                return err("Это ваша собственная комната")

            cur.execute(f"UPDATE {SCHEMA}.rooms SET guest_id=%s,status='playing',updated_at=NOW() WHERE id=%s", (player_id, rid))
            conn.commit()
            return ok({"code": code, "role": "guest", "world_id": world_id, "world_name": world_name, "world_emoji": world_emoji})

        # ── SYNC STATE + CHAT FETCH ───────────────────────────────────────────
        elif method == "POST" and action == "sync":
            if not player_id:
                return err("player_id required")
            code = body.get("code", "").upper().strip()

            cur.execute(
                f"SELECT id,host_id,guest_id,status,world_id,world_name,world_emoji,"
                f"host_x,host_y,host_emotion,guest_x,guest_y,guest_emotion,"
                f"coins_collected,enemies_alive FROM {SCHEMA}.rooms WHERE code=%s", (code,)
            )
            row = cur.fetchone()
            if not row:
                return err("Комната не найдена", 404)

            rid, host_id, guest_id, status, world_id, world_name, world_emoji, \
                hx, hy, h_em, gx, gy, g_em, coins_col, enemies_alive = row

            role = "host" if player_id == host_id else "guest"
            px = body.get("x")
            py = body.get("y")
            emotion = body.get("emotion", "idle")

            updates = ["updated_at=NOW()"]
            params = []
            if role == "host":
                if px is not None: updates.append("host_x=%s"); params.append(float(px))
                if py is not None: updates.append("host_y=%s"); params.append(float(py))
                updates.append("host_emotion=%s"); params.append(emotion[:16])
            else:
                if px is not None: updates.append("guest_x=%s"); params.append(float(px))
                if py is not None: updates.append("guest_y=%s"); params.append(float(py))
                updates.append("guest_emotion=%s"); params.append(emotion[:16])

            c_col = body.get("coins_collected")
            e_al  = body.get("enemies_alive")
            if c_col is not None: updates.append("coins_collected=%s"); params.append(str(c_col))
            if e_al  is not None: updates.append("enemies_alive=%s");   params.append(str(e_al))

            params.append(rid)
            cur.execute(f"UPDATE {SCHEMA}.rooms SET {', '.join(updates)} WHERE id=%s", params)
            conn.commit()

            cur.execute(
                f"SELECT host_x,host_y,host_emotion,guest_x,guest_y,guest_emotion,"
                f"status,coins_collected,enemies_alive FROM {SCHEMA}.rooms WHERE id=%s", (rid,)
            )
            r2 = cur.fetchone()
            hx2,hy2,h_em2,gx2,gy2,g_em2,st2,cc2,ea2 = r2

            # Fetch last 20 chat messages
            since_id = body.get("since_id", 0)
            cur.execute(
                f"SELECT id,role,message,extract(epoch from created_at)::int FROM {SCHEMA}.chat_messages"
                f" WHERE room_code=%s AND id>%s ORDER BY id ASC LIMIT 20",
                (code, since_id)
            )
            messages = [{"id": r[0], "role": r[1], "text": r[2], "ts": r[3]} for r in cur.fetchall()]

            return ok({
                "role": role, "status": st2, "has_partner": guest_id is not None,
                "host": {"x": hx2, "y": hy2, "emotion": h_em2},
                "guest": {"x": gx2, "y": gy2, "emotion": g_em2},
                "coins_collected": cc2, "enemies_alive": ea2,
                "messages": messages,
            })

        # ── SEND CHAT MESSAGE ─────────────────────────────────────────────────
        elif method == "POST" and action == "chat":
            if not player_id:
                return err("player_id required")
            code = body.get("code", "").upper().strip()
            msg  = (body.get("message") or "").strip()[:120]
            if not msg:
                return err("empty message")

            cur.execute(f"SELECT id,host_id,guest_id,status FROM {SCHEMA}.rooms WHERE code=%s", (code,))
            row = cur.fetchone()
            if not row:
                return err("Комната не найдена", 404)
            rid, host_id, guest_id, status = row
            role = "host" if player_id == host_id else "guest"

            cur.execute(
                f"INSERT INTO {SCHEMA}.chat_messages (room_code,player_id,role,message) VALUES (%s,%s,%s,%s) RETURNING id",
                (code, player_id, role, msg)
            )
            new_id = cur.fetchone()[0]
            conn.commit()
            return ok({"id": new_id, "role": role, "text": msg})

        # ── LEAVE ─────────────────────────────────────────────────────────────
        elif method == "POST" and action == "leave":
            code = body.get("code", "").upper().strip()
            cur.execute(f"UPDATE {SCHEMA}.rooms SET status='closed',updated_at=NOW() WHERE code=%s", (code,))
            conn.commit()
            return ok({"ok": True})

        # ── ROOM INFO ─────────────────────────────────────────────────────────
        elif method == "GET" and action == "info":
            code = qs.get("code", "").upper().strip()
            cur.execute(f"SELECT status,host_id,guest_id,world_name,world_emoji FROM {SCHEMA}.rooms WHERE code=%s", (code,))
            row = cur.fetchone()
            if not row:
                return err("Комната не найдена", 404)
            status, host_id, guest_id, world_name, world_emoji = row
            return ok({"status": status, "has_partner": guest_id is not None, "world_name": world_name, "world_emoji": world_emoji})

        else:
            return err("Unknown action", 404)

    finally:
        cur.close()
        conn.close()
