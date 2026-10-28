import os
import sys
import time
import json
import urllib.request
import urllib.parse
from dotenv import load_dotenv
from google import genai

sys.stdout.reconfigure(encoding='utf-8')

load_dotenv('apps/api/.env')

PAGE_ID = os.getenv('FACEBOOK_PAGE_ID', '1381196421750749')
PAGE_TOKEN = os.getenv('FACEBOOK_PAGE_ACCESS_TOKEN')
GEMINI_KEY = os.getenv('GEMINI_API_KEY')

client = genai.Client(api_key=GEMINI_KEY)
seen_msg_ids = set()

SYSTEM_INSTRUCTION = """Bạn là Chuyên viên tư vấn du lịch thông minh của TripC Đà Nẵng trên Fanpage 'Dịch vụ hỗ trợ du lịch'.
Phong cách:
- Luôn thân thiện, ân cần, tự nhiên như người thật, có cảm xúc.
- ĐI THẲNG VÀO TRỌNG TÂM câu hỏi của khách hàng.
- LUÔN GHI NHỚ toàn bộ lịch sử trò chuyện phía trước. Tuyệt đối KHÔNG hỏi lại những thông tin khách đã cung cấp (như số người, số đêm, khu vực...).
- Am hiểu sâu sắc về du lịch Đà Nẵng:
  + Khu Liên Chiểu: Biển Xuân Thiều, vịnh Đà Nẵng, Mikazuki Onsen, chợ Hòa Khánh (nhiều đồ ăn ngon rẻ sinh viên), homestay Bay, Gió Biển, giá bình dân 300k - 450k/đêm.
  + Khu Ngũ Hành Sơn / Sơn Trà: Biển Mỹ Khê, phố Tây An Thượng, hải sản Năm Đảnh, Bé Mặn, homestay Hanigo, Dunu, khách sạn Sala, Belle Maison view biển.
  + Khu Hải Châu: Trung tâm, cầu Rồng phun lửa cuối tuần, chợ Hàn, chợ Cồn, sông Hàn.
- Khi tư vấn, đưa ra các phương án cụ thể, kèm dự toán chi phí rõ ràng. Chỉ hỏi thêm 1 thông tin duy nhất cần thiết để chốt dịch vụ (ví dụ ngày check-in cụ thể).
"""

def send_messenger_reply(recipient_id: str, text: str):
    url = f"https://graph.facebook.com/v20.0/me/messages?access_token={PAGE_TOKEN}"
    payload = {
        "recipient": {"id": recipient_id},
        "message": {"text": text},
        "messaging_type": "RESPONSE"
    }
    data = json.dumps(payload).encode("utf-8")
    req = urllib.request.Request(url, data=data, headers={"Content-Type": "application/json"})
    try:
        with urllib.request.urlopen(req) as resp:
            return json.loads(resp.read().decode("utf-8"))
    except Exception as e:
        print(f"Error sending reply to {recipient_id}: {e}")
        return None

def fetch_conversations():
    url = f"https://graph.facebook.com/v20.0/{PAGE_ID}/conversations?fields=id,messages{{id,message,from,created_time}}&access_token={PAGE_TOKEN}"
    req = urllib.request.Request(url, headers={"User-Agent": "AI-Growth-OS/1.0"})
    try:
        with urllib.request.urlopen(req) as resp:
            return json.loads(resp.read().decode("utf-8")).get("data", [])
    except Exception as e:
        print(f"Error fetching conversations: {e}")
        return []

def run_loop():
    print("🤖 GEMINI 2.5 FLASH MESSENGER BOT IS RUNNING 24/7...")
    print(f"📡 Fanpage: Dịch vụ hỗ trợ du lịch (ID: {PAGE_ID})")
    print(f"🔑 Page Token: {PAGE_TOKEN[:25]}... (active)")

    # Pre-seed existing messages so we don't double reply old history on restart
    initial_convs = fetch_conversations()
    for conv in initial_convs:
        msgs = conv.get("messages", {}).get("data", [])
        if msgs:
            # Chronological order
            chrono_msgs = list(reversed(msgs))
            # Seed all except if the very latest message is from customer and unanswered
            latest_msg = chrono_msgs[-1]
            latest_sender_id = latest_msg.get("from", {}).get("id")
            
            for m in chrono_msgs:
                # If page was the last one who spoke, all messages in this thread are seen
                if latest_sender_id == PAGE_ID:
                    seen_msg_ids.add(m.get("id"))
                else:
                    # If customer is waiting, only mark earlier messages as seen
                    if m.get("id") != latest_msg.get("id"):
                        seen_msg_ids.add(m.get("id"))
                        
    print(f"✅ Initialized with {len(seen_msg_ids)} seen messages. Ready for incoming chat.")

    while True:
        try:
            convs = fetch_conversations()
            for conv in convs:
                msgs = conv.get("messages", {}).get("data", [])
                if not msgs:
                    continue

                # Chronological order
                chrono_msgs = list(reversed(msgs))
                latest_msg = chrono_msgs[-1]

                # If latest message is from customer and not seen yet
                sender_id = latest_msg.get("from", {}).get("id")
                sender_name = latest_msg.get("from", {}).get("name", "Khách hàng")
                msg_id = latest_msg.get("id")

                if sender_id != PAGE_ID and msg_id not in seen_msg_ids:
                    seen_msg_ids.add(msg_id)
                    print(f"\n📩 [NEW MESSAGE from {sender_name}]: {latest_msg.get('message')}")

                    # Build conversation transcript for Gemini
                    history_lines = []
                    for m in chrono_msgs[-10:]: # last 10 turns
                        role = "Khách hàng" if m.get("from", {}).get("id") != PAGE_ID else "Tư vấn viên (Fanpage)"
                        history_lines.append(f"{role}: {m.get('message')}")

                    dialogue_context = "\n".join(history_lines)
                    gemini_prompt = f"""{SYSTEM_INSTRUCTION}

Dưới đây là đoạn hội thoại thực tế giữa khách hàng ({sender_name}) và Fanpage:
{dialogue_context}

Nhiệm vụ: Hãy đóng vai Chuyên viên tư vấn du lịch TripC và viết câu phản hồi tiếp theo cho tin nhắn mới nhất của {sender_name}.
Yêu cầu:
- Trả lời ĐÚNG TRỌNG TÂM những gì khách vừa nói.
- Nhớ các chi tiết khách đã nói ở trên.
- Tuyệt đối không lặp lại câu chào hỏi rập khuôn hoặc hỏi lại những gì khách đã trả lời.
- Ngắn gọn, súc tích, tự nhiên."""

                    try:
                        ai_resp = client.models.generate_content(
                            model="gemini-2.5-flash",
                            contents=gemini_prompt
                        )
                        reply_text = ai_resp.text.strip()
                        print(f"🧠 [Gemini 2.5 Flash Reply]:\n{reply_text}")

                        # Send via Messenger API
                        result = send_messenger_reply(sender_id, reply_text)
                        if result:
                            print(f"🚀 Sent successfully to Messenger (ID: {result.get('message_id')})")
                    except Exception as ai_err:
                        print(f"AI generation or send error: {ai_err}")

        except Exception as loop_err:
            print(f"Loop iteration error: {loop_err}")

        time.sleep(3)

if __name__ == "__main__":
    run_loop()
