const express = require("express");
const cors = require("cors");
const app = express();
const PORT = process.env.PORT || 10000;

// 1. เปิดใช้งาน CORS สำหรับทุก Origin เพื่อให้เว็บหน้าบ้าน (Frontend) เรียกใช้งานได้
app.use(cors());

// 2. เสิร์ฟไฟล์หน้าบ้านจากโฟลเดอร์ public (เช่น index.html สำหรับเปิดทดสอบ)
app.use(express.static("public"));

// 3. API เส้นหลักสำหรับทำ Proxy
app.get("/proxy", async (req, res) => {
  const targetUrl = req.query.url;
  if (!targetUrl) {
    return res.status(400).send("Error: Missing 'url' parameter");
  }

  try {
    // กำหนด Headers เพื่อปลอมตัวหลอกระบบตรวจจับของเว็บต้นทาง
    const headers = {
      "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
      "Referer": "https://madoball.com/",
      "Origin": "https://madoball.com",
      "Accept": "*/*",
      "Accept-Language": "en-US,en;q=0.9"
    };

    // ใช้ Native Fetch ของ Node.js (มีมาให้พร้อมใช้ใน Node.js v18 ขึ้นไป)
    const response = await fetch(targetUrl, { headers });

    if (!response.ok) {
      return res.status(response.status).send(`Target server responded with code ${response.status}`);
    }

    // ตัดส่วน Query String ออกเพื่อเช็กนามสกุลไฟล์หลัก (.ts หรือ .m3u8)
    const urlWithoutQuery = targetUrl.split("?")[0];

    // --- กรณีที่ 1: จัดการไฟล์วิดีโอย่อย (.ts) ---
    if (urlWithoutQuery.endsWith(".ts")) {
      res.setHeader("Content-Type", response.headers.get("content-type") || "video/MP2T");
      
      // ดึงข้อมูลและทำ Stream Pipe ส่งต่อไปหา User ทันทีเพื่อความลื่นไหลและประหยัด Memory ของ Server
      const reader = response.body.getReader();
      const stream = new ReadableStream({
        async start(controller) {
          while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            controller.enqueue(value);
          }
          controller.close();
        }
      });
      
      const nodeStream = require("stream").Readable.fromWeb(stream);
      nodeStream.pipe(res);
      return;
    }

    // --- กรณีที่ 2: จัดการไฟล์สารบัญสตรีม (.m3u8) ---
    let text = await response.text();
    // หา Base URL ของไฟล์ปัจจุบัน เพื่อเอาไว้ต่อ Path ลิงก์ภายในที่เป็นแบบสั้น (Relative Path)
    const baseUrl = targetUrl.substring(0, targetUrl.lastIndexOf("/") + 1);

    // วนลูปอ่านข้อมูล m3u8 ทีละบรรทัดเพื่อแก้ลิงก์ข้างในให้วิ่งผ่าน Proxy ของเราทั้งหมด
    const rewrittenText = text.split("\n").map(line => {
      const trimmedLine = line.trim();
      
      // ข้ามบรรทัดที่เป็น Comment หรือบรรทัดว่าง
      if (trimmedLine.startsWith("#") || trimmedLine === "") {
        return line;
      }

      // ตรวจสอบว่าเป็นลิงก์เต็ม (Absolute URL) หรือลิงก์สั้น (Relative Path)
      let fullUrl = trimmedLine;
      if (!trimmedLine.startsWith("http://") && !trimmedLine.startsWith("https://")) {
        fullUrl = baseUrl + trimmedLine;
      }

      // ครอบลิงก์เหล่านั้นด้วยคำสั่งวิ่งผ่านมาที่ Proxy ของเราเอง
      return `/proxy?url=${encodeURIComponent(fullUrl)}`;
    }).join("\n");

    res.setHeader("Content-Type", "application/vnd.apple.mpegurl");
    res.send(rewrittenText);

  } catch (err) {
    console.error("Proxy error:", err.message);
    res.status(500).send("Proxy internal error");
  }
});

// เปิดรัน Server ตาม Port ที่กำหนด
app.listen(PORT, () => {
  console.log(`🚀 Full-System Proxy Server is running on port ${PORT}`);
});
