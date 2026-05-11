from __future__ import annotations

import base64
import json
import os
import socket
import struct
import subprocess
import tempfile
import time
import urllib.parse
import urllib.request
from io import BytesIO
from pathlib import Path

from PIL import Image


ROOT = Path(__file__).resolve().parents[1]
ASSET_DIR = ROOT / "Manual_Usuario_SimpliaLeads_assets"
CHROME = Path(os.environ.get("CHROME_PATH", r"C:\Program Files\Google\Chrome\Application\chrome.exe"))
PORT = int(os.environ.get("SIMPLIA_CAPTURE_PORT", "9338"))
BASE_URL = os.environ.get("SIMPLIA_CAPTURE_URL", "http://localhost:8080/login")


class WebSocketCDP:
    def __init__(self, websocket_url: str):
        parsed = urllib.parse.urlparse(websocket_url)
        self.host = parsed.hostname or "127.0.0.1"
        self.port = parsed.port or 80
        self.path = parsed.path + (f"?{parsed.query}" if parsed.query else "")
        self.sock = socket.create_connection((self.host, self.port), timeout=12)
        self._handshake()
        self.next_id = 1

    def _handshake(self) -> None:
        key = base64.b64encode(os.urandom(16)).decode("ascii")
        request = (
            f"GET {self.path} HTTP/1.1\r\n"
            f"Host: {self.host}:{self.port}\r\n"
            "Upgrade: websocket\r\n"
            "Connection: Upgrade\r\n"
            f"Sec-WebSocket-Key: {key}\r\n"
            "Sec-WebSocket-Version: 13\r\n\r\n"
        )
        self.sock.sendall(request.encode("ascii"))
        response = self.sock.recv(4096)
        if b"101" not in response.split(b"\r\n", 1)[0]:
            raise RuntimeError(f"WebSocket handshake failed: {response[:120]!r}")

    def _send_frame(self, payload: str) -> None:
        data = payload.encode("utf-8")
        header = bytearray([0x81])
        length = len(data)
        if length < 126:
            header.append(0x80 | length)
        elif length < 65536:
            header.append(0x80 | 126)
            header.extend(struct.pack("!H", length))
        else:
            header.append(0x80 | 127)
            header.extend(struct.pack("!Q", length))
        mask = os.urandom(4)
        header.extend(mask)
        masked = bytes(byte ^ mask[i % 4] for i, byte in enumerate(data))
        self.sock.sendall(bytes(header) + masked)

    def _recv_exact(self, length: int) -> bytes:
        chunks = []
        remaining = length
        while remaining:
            chunk = self.sock.recv(remaining)
            if not chunk:
                raise RuntimeError("WebSocket closed")
            chunks.append(chunk)
            remaining -= len(chunk)
        return b"".join(chunks)

    def _recv_frame(self) -> str:
        first = self._recv_exact(2)
        opcode = first[0] & 0x0F
        length = first[1] & 0x7F
        if length == 126:
            length = struct.unpack("!H", self._recv_exact(2))[0]
        elif length == 127:
            length = struct.unpack("!Q", self._recv_exact(8))[0]
        masked = bool(first[1] & 0x80)
        mask = self._recv_exact(4) if masked else b""
        payload = self._recv_exact(length)
        if masked:
            payload = bytes(byte ^ mask[i % 4] for i, byte in enumerate(payload))
        if opcode == 8:
            raise RuntimeError("WebSocket closed by server")
        if opcode == 9:
            return self._recv_frame()
        return payload.decode("utf-8", errors="replace")

    def send(self, method: str, params: dict | None = None, timeout: float = 12) -> dict:
        message_id = self.next_id
        self.next_id += 1
        self._send_frame(json.dumps({"id": message_id, "method": method, "params": params or {}}))
        deadline = time.time() + timeout
        while time.time() < deadline:
            raw = self._recv_frame()
            if not raw:
                continue
            message = json.loads(raw)
            if message.get("id") == message_id:
                if "error" in message:
                    raise RuntimeError(f"CDP error {method}: {message['error']}")
                return message.get("result", {})
        raise TimeoutError(f"Timeout waiting for {method}")


def wait_http(url: str, timeout: float = 15) -> None:
    deadline = time.time() + timeout
    while time.time() < deadline:
        try:
            with urllib.request.urlopen(url, timeout=1) as response:
                if response.status < 500:
                    return
        except Exception:
            time.sleep(0.25)
    raise RuntimeError(f"Not reachable: {url}")


def chrome_json(path: str, method: str = "GET") -> dict:
    request = urllib.request.Request(f"http://127.0.0.1:{PORT}{path}", method=method)
    with urllib.request.urlopen(request, timeout=8) as response:
        return json.loads(response.read().decode("utf-8"))


def eval_js(cdp: WebSocketCDP, expression: str, timeout: float = 12):
    result = cdp.send(
        "Runtime.evaluate",
        {
            "expression": expression,
            "awaitPromise": True,
            "returnByValue": True,
        },
        timeout=timeout,
    )
    if result.get("exceptionDetails"):
        raise RuntimeError(result["exceptionDetails"])
    value = result.get("result", {})
    return value.get("value")


def wait_for(cdp: WebSocketCDP, expression: str, timeout: float = 20, interval: float = 0.35):
    deadline = time.time() + timeout
    last = None
    while time.time() < deadline:
        try:
            last = eval_js(cdp, expression, timeout=5)
            if last:
                return last
        except Exception as exc:
            last = exc
        time.sleep(interval)
    raise TimeoutError(f"Condition not met: {expression} last={last!r}")


def click_text(cdp: WebSocketCDP, text: str) -> None:
    rect = eval_js(
        cdp,
        f"""
        (() => {{
          const target = [...document.querySelectorAll('button,[role="tab"],a')]
            .find(el => (el.textContent || '').trim() === {json.dumps(text)});
          if (!target) return {{ ok: false }};
          target.scrollIntoView({{block:'center', inline:'center'}});
          const r = target.getBoundingClientRect();
          return {{ ok: true, x: r.left + r.width / 2, y: r.top + r.height / 2, text: target.textContent || '' }};
        }})()
        """,
    )
    if not rect or not rect.get("ok"):
        raise RuntimeError(f"Could not click navigation item: {text}")
    x = float(rect["x"])
    y = float(rect["y"])
    cdp.send("Input.dispatchMouseEvent", {"type": "mouseMoved", "x": x, "y": y})
    cdp.send("Input.dispatchMouseEvent", {"type": "mousePressed", "x": x, "y": y, "button": "left", "clickCount": 1})
    cdp.send("Input.dispatchMouseEvent", {"type": "mouseReleased", "x": x, "y": y, "button": "left", "clickCount": 1})


def set_date_range(cdp: WebSocketCDP) -> None:
    current = eval_js(cdp, "document.querySelector('#date')?.textContent || ''")
    if "abr 01, 2026" in current and "may 04, 2026" in current:
        return

    def click_calendar_day(table_index: int, day: str) -> None:
        rect = eval_js(
            cdp,
            f"""
            (() => {{
              const root = [...document.querySelectorAll('div')]
                .filter(el => el.querySelectorAll('table').length === 2 && el.querySelectorAll('button').length > 20)
                .sort((a, b) => a.querySelectorAll('button').length - b.querySelectorAll('button').length)[0];
              if (!root) return {{ ok: false, reason: 'calendar_root_not_found' }};
              const tables = [...root.querySelectorAll('table')];
              const table = tables[{table_index}];
              const target = [...table.querySelectorAll('button')]
                .find(b => (b.textContent || '').trim() === {json.dumps(day)} && !(b.className || '').includes('day-outside'));
              if (!target) return {{ ok: false, reason: 'day_not_found', text: root.textContent }};
              target.scrollIntoView({{ block: 'center', inline: 'center' }});
              const r = target.getBoundingClientRect();
              return {{ ok: true, x: r.left + r.width / 2, y: r.top + r.height / 2, text: target.textContent, rootText: root.textContent }};
            }})()
            """,
        )
        if not rect or not rect.get("ok"):
            raise RuntimeError(f"Could not locate calendar day {day}: {rect}")
        x = float(rect["x"])
        y = float(rect["y"])
        cdp.send("Input.dispatchMouseEvent", {"type": "mouseMoved", "x": x, "y": y})
        cdp.send("Input.dispatchMouseEvent", {"type": "mousePressed", "x": x, "y": y, "button": "left", "clickCount": 1})
        cdp.send("Input.dispatchMouseEvent", {"type": "mouseReleased", "x": x, "y": y, "button": "left", "clickCount": 1})

    def calendar_text() -> str:
        return eval_js(
            cdp,
            """
            (() => {
              const root = [...document.querySelectorAll('div')]
                .filter(el => el.querySelectorAll('table').length === 2 && el.querySelectorAll('button').length > 20)
                .sort((a, b) => a.querySelectorAll('button').length - b.querySelectorAll('button').length)[0];
              return root?.textContent || '';
            })()
            """,
        ) or ""

    def click_previous_month() -> None:
        rect = eval_js(
            cdp,
            """
            (() => {
              const root = [...document.querySelectorAll('div')]
                .filter(el => el.querySelectorAll('table').length === 2 && el.querySelectorAll('button').length > 20)
                .sort((a, b) => a.querySelectorAll('button').length - b.querySelectorAll('button').length)[0];
              if (!root) return { ok: false, reason: 'calendar_root_not_found' };
              const target = [...root.querySelectorAll('button')].find(b => {
                const aria = b.getAttribute('aria-label') || '';
                return /previous|anterior|prev/i.test(aria);
              }) || root.querySelector('button[name="previous-month"]');
              if (!target) return { ok: false, reason: 'previous_button_not_found', text: root.textContent };
              const r = target.getBoundingClientRect();
              return { ok: true, x: r.left + r.width / 2, y: r.top + r.height / 2, text: target.getAttribute('aria-label') || '' };
            })()
            """,
        )
        if not rect or not rect.get("ok"):
            raise RuntimeError(f"Could not locate previous month button: {rect}")
        x = float(rect["x"])
        y = float(rect["y"])
        cdp.send("Input.dispatchMouseEvent", {"type": "mouseMoved", "x": x, "y": y})
        cdp.send("Input.dispatchMouseEvent", {"type": "mousePressed", "x": x, "y": y, "button": "left", "clickCount": 1})
        cdp.send("Input.dispatchMouseEvent", {"type": "mouseReleased", "x": x, "y": y, "button": "left", "clickCount": 1})

    eval_js(cdp, "document.querySelector('#date')?.click(); true")
    time.sleep(0.7)
    for _ in range(4):
        visible_months = calendar_text().lower()
        if "abril" in visible_months and "mayo" in visible_months:
            break
        click_previous_month()
        time.sleep(0.45)
    visible_months = calendar_text().lower()
    if "abril" not in visible_months or "mayo" not in visible_months:
        raise RuntimeError(f"Could not show April/May calendar: {visible_months}")
    click_calendar_day(0, "1")
    time.sleep(0.35)
    click_calendar_day(1, "4")
    time.sleep(0.7)
    try:
        wait_for(cdp, "/abr 01, 2026.*may 04, 2026/i.test(document.querySelector('#date')?.textContent || '')", timeout=8)
    except TimeoutError as exc:
        date_text = eval_js(cdp, "document.querySelector('#date')?.textContent || ''")
        debug = eval_js(
            cdp,
            """
            (() => {
              const root = [...document.querySelectorAll('div')]
                .filter(el => el.querySelectorAll('table').length === 2 && el.querySelectorAll('button').length > 20)
                .sort((a, b) => a.querySelectorAll('button').length - b.querySelectorAll('button').length)[0];
              return {
                rootText: (root?.textContent || '').slice(0, 500),
                buttons: [...(root?.querySelectorAll('button') || [])].slice(0, 10).map((b, i) => ({
                  i,
                  text: (b.textContent || '').trim(),
                  aria: b.getAttribute('aria-label') || '',
                  cls: b.className || '',
                  html: b.outerHTML.slice(0, 160)
                }))
              };
            })()
            """,
        )
        raise TimeoutError(f"No se pudo fijar el rango 01/04/2026 - 04/05/2026. Texto actual: {date_text!r}. Debug: {debug}") from exc
    cdp.send("Input.dispatchKeyEvent", {"type": "keyDown", "windowsVirtualKeyCode": 27, "nativeVirtualKeyCode": 27, "key": "Escape", "code": "Escape"})
    cdp.send("Input.dispatchKeyEvent", {"type": "keyUp", "windowsVirtualKeyCode": 27, "nativeVirtualKeyCode": 27, "key": "Escape", "code": "Escape"})
    time.sleep(0.35)
    eval_js(cdp, "document.body.click(); true")


def screenshot(cdp: WebSocketCDP, filename: str, *, scroll_y: int = 0) -> Path:
    eval_js(cdp, f"window.scrollTo(0, {scroll_y}); true")
    time.sleep(0.9)
    data = cdp.send("Page.captureScreenshot", {"format": "png", "fromSurface": True, "captureBeyondViewport": False}, timeout=20)["data"]
    image = Image.open(BytesIO(base64.b64decode(data))).convert("RGB")
    path = ASSET_DIR / filename
    image.save(path, quality=95)
    return path


def page_scrolls(cdp: WebSocketCDP, step: int = 760, max_frames: int = 5) -> list[int]:
    metrics = eval_js(
        cdp,
        """
        (() => ({
          height: Math.max(document.documentElement.scrollHeight, document.body.scrollHeight),
          viewport: window.innerHeight
        }))()
        """,
    )
    page_height = int(metrics.get("height") or 1000)
    viewport = int(metrics.get("viewport") or 1000)
    last_scroll = max(0, page_height - viewport)
    scrolls = [0]
    current = step
    while current < last_scroll and len(scrolls) < max_frames - 1:
        scrolls.append(current)
        current += step
    if last_scroll and last_scroll not in scrolls and len(scrolls) < max_frames:
        scrolls.append(last_scroll)
    return scrolls


def main() -> None:
    ASSET_DIR.mkdir(exist_ok=True)
    wait_http("http://localhost:8080", timeout=12)
    profile_dir = Path(tempfile.mkdtemp(prefix="simplia-manual-chrome-"))
    chrome = subprocess.Popen(
        [
            str(CHROME),
            "--headless=new",
            f"--remote-debugging-port={PORT}",
            f"--user-data-dir={profile_dir}",
            "--disable-gpu",
            "--no-first-run",
            "--no-default-browser-check",
            "--window-size=1600,1000",
            "--force-device-scale-factor=1",
            "about:blank",
        ],
        stdout=subprocess.DEVNULL,
        stderr=subprocess.DEVNULL,
    )
    try:
        wait_http(f"http://127.0.0.1:{PORT}/json/version", timeout=15)
        target = chrome_json("/json/new?" + urllib.parse.quote(BASE_URL, safe=":/?=&"), method="PUT")
        cdp = WebSocketCDP(target["webSocketDebuggerUrl"])
        cdp.send("Page.enable")
        cdp.send("Runtime.enable")
        cdp.send("Emulation.setDeviceMetricsOverride", {"width": 1600, "height": 1000, "deviceScaleFactor": 1, "mobile": False})
        cdp.send("Page.navigate", {"url": BASE_URL})
        wait_for(cdp, "document.readyState === 'complete' || document.readyState === 'interactive'", timeout=20)
        wait_for(cdp, "!!document.querySelector('#username')", timeout=20)
        eval_js(
            cdp,
            """
            (() => {
              const setNativeValue = (el, value) => {
                const proto = Object.getPrototypeOf(el);
                const descriptor = Object.getOwnPropertyDescriptor(proto, 'value');
                descriptor?.set?.call(el, value);
                el.dispatchEvent(new Event('input', { bubbles: true }));
                el.dispatchEvent(new Event('change', { bubbles: true }));
              };
              const u = document.querySelector('#username');
              const p = document.querySelector('#password');
              setNativeValue(u, 'test');
              setNativeValue(p, 'test');
              [...document.querySelectorAll('button')]
                .find((button) => (button.textContent || '').includes('Iniciar Sesión'))
                ?.click();
              return true;
            })()
            """,
        )
        try:
            wait_for(cdp, "location.pathname !== '/login' && !![...document.querySelectorAll('button')].find(b => (b.textContent||'').includes('Estrategia'))", timeout=35)
        except TimeoutError as exc:
            page_state = eval_js(
                cdp,
                """
                (() => ({
                  href: location.href,
                  body: document.body.innerText.slice(0, 1200),
                  username: document.querySelector('#username')?.value || '',
                  passwordLength: document.querySelector('#password')?.value?.length || 0
                }))()
                """,
            )
            raise TimeoutError(f"No se pudo iniciar sesión automáticamente: {page_state}") from exc
        set_date_range(cdp)

        created: list[Path] = []
        tab_specs = [
            ("Estrategia", "01_estrategia", 3),
            ("Embudo", "02_embudo", 4),
            ("Operación", "03_operacion", 3),
            ("Seguimiento", "04_seguimiento", 5),
            ("Rendimiento Humano", "05_rendimiento_humano", 4),
            ("Tendencias", "06_tendencias", 5),
            ("Calidad", "07_calidad", 5),
            ("Conversaciones", "08_conversaciones", 4),
            ("Reportes", "09_reportes", 5),
        ]
        for tab_name, prefix, max_frames in tab_specs:
            click_text(cdp, tab_name)
            time.sleep(1.5)
            if tab_name != "Seguimiento":
                set_date_range(cdp)
            scrolls = page_scrolls(cdp, max_frames=max_frames)
            for index, scroll_y in enumerate(scrolls, start=1):
                filename = f"{prefix}_{index:02d}_real.png"
                created.append(screenshot(cdp, filename, scroll_y=scroll_y))

        print("CAPTURED")
        for path in created:
            print(path)
    finally:
        chrome.terminate()
        try:
            chrome.wait(timeout=5)
        except subprocess.TimeoutExpired:
            chrome.kill()


if __name__ == "__main__":
    main()
