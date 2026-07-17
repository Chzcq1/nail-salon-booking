/**
 * Typewriter — พิมพ์ข้อความทีละตัวอักษร วนสับเปลี่ยนได้หลายคำ
 * Logic ปรับมาจาก fancycomponents.dev / Originkit
 * ทำงานใน plain React (Vite) — ไม่ขึ้นกับ Framer canvas
 */
import { useEffect, useState } from "react";
import { motion } from "framer-motion";

interface TypewriterProps {
  /** รายการข้อความที่จะวนสับเปลี่ยน */
  texts: string[];
  /** สีของข้อความที่พิมพ์ออกมา */
  typedColor?: string;
  /** สีเคอร์เซอร์ (ถ้าไม่ระบุ = ใช้ typedColor) */
  cursorColor?: string;
  /** ตัวเคอร์เซอร์ */
  cursorChar?: string;
  /** ความเร็วพิมพ์ (ms/ตัวอักษร) */
  typeSpeed?: number;
  /** ความเร็วลบ (ms/ตัวอักษร) */
  deleteSpeed?: number;
  /** หยุดรอก่อนเริ่มลบ (ms) */
  holdMs?: number;
  /** แสดงเคอร์เซอร์ไหม */
  showCursor?: boolean;
  style?: React.CSSProperties;
}

export function Typewriter({
  texts,
  typedColor = "#FFFFFF",
  cursorColor,
  cursorChar = "|",
  typeSpeed = 70,
  deleteSpeed = 35,
  holdMs = 1800,
  showCursor = true,
  style,
}: TypewriterProps) {
  const list = texts.filter((t): t is string => typeof t === "string" && t.length > 0);

  const [displayText, setDisplayText] = useState("");
  const [currentIndex, setCurrentIndex] = useState(0);
  const [isDeleting, setIsDeleting] = useState(false);
  const [currentTextIndex, setCurrentTextIndex] = useState(0);

  // ── State machine (ported from upstream, one timeout per render tick) ──────
  useEffect(() => {
    if (!list.length) return;
    let timeout: ReturnType<typeof setTimeout>;
    const currentText = list[currentTextIndex] ?? "";

    if (isDeleting) {
      if (displayText === "") {
        // ลบจนหมด → ไปคำถัดไป
        setIsDeleting(false);
        setCurrentTextIndex(prev => (prev + 1) % list.length);
        setCurrentIndex(0);
      } else {
        timeout = setTimeout(
          () => setDisplayText(prev => prev.slice(0, -1)),
          deleteSpeed
        );
      }
    } else {
      if (currentIndex < currentText.length) {
        // กำลังพิมพ์
        timeout = setTimeout(() => {
          setDisplayText(prev => prev + currentText[currentIndex]);
          setCurrentIndex(prev => prev + 1);
        }, typeSpeed);
      } else if (list.length > 1) {
        // พิมพ์ครบ → รอ holdMs แล้วเริ่มลบ
        timeout = setTimeout(() => setIsDeleting(true), holdMs);
      }
      // ถ้ามีคำเดียว → ค้างไว้เฉยๆ
    }

    return () => clearTimeout(timeout);
  }, [currentIndex, displayText, isDeleting, currentTextIndex, typeSpeed, deleteSpeed, holdMs, list.length]);

  // รีเซ็ต state machine เมื่อ texts prop เปลี่ยน
  const textsKey = list.join("||");
  useEffect(() => {
    setDisplayText("");
    setCurrentIndex(0);
    setIsDeleting(false);
    setCurrentTextIndex(0);
  }, [textsKey]); // eslint-disable-line react-hooks/exhaustive-deps

  const resolvedCursorColor = cursorColor || typedColor;

  return (
    <span style={{ display: "inline", ...style }}>
      <span style={{ color: typedColor }}>{displayText}</span>
      {showCursor && (
        <motion.span
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{
            duration: 0.01,
            repeat: Infinity,
            repeatDelay: 0.4,
            repeatType: "reverse",
          }}
          style={{
            color: resolvedCursorColor,
            marginLeft: "0.08em",
            fontWeight: 300,
            display: "inline-block",
          }}
        >
          {cursorChar}
        </motion.span>
      )}
    </span>
  );
}
