import os
import sys
import json
import urllib.request
import urllib.parse
from dotenv import load_dotenv

sys.stdout.reconfigure(encoding='utf-8')

load_dotenv('apps/api/.env')

USER_TOKEN = os.getenv('FACEBOOK_PAGE_ACCESS_TOKEN')
PAGE_ID = os.getenv('FACEBOOK_PAGE_ID', '1381196421750749')

print(f"Fetching accounts for User Token...")
url = f"https://graph.facebook.com/v20.0/me/accounts?access_token={USER_TOKEN}"
req = urllib.request.Request(url)
with urllib.request.urlopen(req) as resp:
    data = json.loads(resp.read().decode('utf-8'))
    pages = data.get('data', [])
    print(f"Found {len(pages)} managed pages:")
    
    target_page_token = None
    for p in pages:
        print(f"  * {p.get('name')} (ID: {p.get('id')})")
        if str(p.get('id')) == str(PAGE_ID):
            target_page_token = p.get('access_token')

if not target_page_token:
    print(f"ERROR: Could not find Page ID {PAGE_ID} in accounts list!")
    sys.exit(1)

print(f"\nSuccessfully obtained Page Access Token for Page ID {PAGE_ID}!")

# Update apps/api/.env with the permanent Page Access Token
env_path = 'apps/api/.env'
with open(env_path, 'r', encoding='utf-8') as f:
    env_content = f.read()

import re
new_env = re.sub(
    r'FACEBOOK_PAGE_ACCESS_TOKEN=.*',
    f'FACEBOOK_PAGE_ACCESS_TOKEN={target_page_token}',
    env_content
)
with open(env_path, 'w', encoding='utf-8') as f:
    f.write(new_env)

print("Updated apps/api/.env with new Page Access Token.")

# Now test publishing the post!
POST_MESSAGE = """🌿 TÌM HOMESTAY YÊN BÌNH - VIEW ĐẸP GIÁ MỀM TẠI ĐÀ NẴNG CHO MÙA HÈ NÀY?

Bạn đang lên kế hoạch du hí Đà Nẵng 1 mình hoặc theo nhóm mà chưa biết chọn homestay nào vừa chill, vừa gần biển lại hợp túi tiền? Tham khảo ngay 3 gợi ý xịn sò:

1️⃣ Bay Homestay Liên Chiểu: Gần biển Xuân Thiều, không gian yên tĩnh, phòng sạch sẽ, giá chỉ từ 320k/đêm.
2️⃣ Hanigo Homestay (gần biển Mỹ Khê): Thiết kế vintage xinh xắn, chủ nhà siêu thân thiện, bước vài bước ra biển.
3️⃣ Gió Biển Homestay: View thoáng mát, đồ ăn địa phương xung quanh siêu rẻ và ngon.

👉 Nhắn tin ngay cho Fanpage hoặc khám phá chi tiết tại: https://tripc.vn/homestay-da-nang?utm_source=facebook&utm_medium=social&utm_campaign=mua_he_da_nang_2026

#dulichdanang #homestaydanang #tripc #travelvietnam #danang2026"""

publish_url = f"https://graph.facebook.com/v20.0/{PAGE_ID}/feed"
post_data = urllib.parse.urlencode({
    'message': POST_MESSAGE,
    'access_token': target_page_token
}).encode('utf-8')

print(f"\nAttempting to publish post to Facebook Fanpage {PAGE_ID}...")
pub_req = urllib.request.Request(publish_url, data=post_data, method='POST')
try:
    with urllib.request.urlopen(pub_req) as pub_resp:
        result = json.loads(pub_resp.read().decode('utf-8'))
        print("\n🎉 POST PUBLISHED SUCCESSFULLY TO FACEBOOK!")
        print("Facebook Post ID:", result.get('id'))
        print(f"Direct link: https://www.facebook.com/{result.get('id')}")
except urllib.error.HTTPError as e:
    err_body = e.read().decode('utf-8')
    print("Publishing Error HTTP", e.code, err_body)
