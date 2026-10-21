# avocadoMini browser game starter

This is a small browser-only game. It runs on an ordinary computer or phone; it is not a Mini OS package, device SDK, App Store submission, Wallet integration, or proof of Mini hardware compatibility.

1. Open `index.html` in a modern browser, or serve this folder with `python3 -m http.server 8000` and visit `http://localhost:8000`.
2. Edit `manifest.example.json` to set the title, round duration, pace, and color. The builder at `https://avocadomini.si/create/` can export a compatible manifest.
3. Change `game.js` to make a different game loop. Keep your own code, art, music, and rights clear.
4. Host your demo at an HTTPS URL. Send the demo and optional public source link at `https://avocadomini.si/create/#submit` for private review.

The manifest schema `avokado-mini-browser-game/1` belongs to this sample only. It gives no access to cameras, microphones, spatial input, Sky Agents, Wallet, or a future Mini runtime. Game exchange/payment uses a separate existing synthetic SDK and remains closed to real funds.

The sample code in this folder is MIT licensed. The `avokado` and `avocadoMini` names and marks are not licensed for third-party branding.
