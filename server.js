const express = require("express");
const fetch = require("node-fetch");
const app = express();

app.get("/proxy", async (req, res) => {
  const url = req.query.url;
  if (!url) return res.status(400).send("No URL");

  try {
    const response = await fetch(url, {
      headers: {
        "User-Agent": "Mozilla/5.0",
        "Referer": "https://ais-vidnt.com",
        "Origin": "https://ais-vidnt.com"
      }
    });

    // stream video (.ts)
    if (url.endsWith(".ts")) {
      res.setHeader("Access-Control-Allow-Origin", "*");
      response.body.pipe(res);
      return;
    }

    let text = await response.text();

    if (url.includes(".m3u8")) {
      const base = url.substring(0, url.lastIndexOf("/") + 1);

      text = text.split("\n").map(line => {
        if (line.endsWith(".ts") || line.endsWith(".m3u8")) {
          const full = line.startsWith("http") ? line : base + line;
          return `/proxy?url=${encodeURIComponent(full)}`;
        }
        return line;
      }).join("\n");

      res.setHeader("Content-Type", "application/vnd.apple.mpegurl");
    }

    res.setHeader("Access-Control-Allow-Origin", "*");
    res.send(text);

  } catch (err) {
    res.status(500).send("Proxy error");
  }
});

app.listen(10000, () => console.log("Running"));
