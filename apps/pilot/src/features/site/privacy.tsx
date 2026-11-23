import { copy,privacyPath,type Locale } from '@/lib/locale';
import { SiteHeader,SiteFooter } from './chrome';
export function PrivacyPage({locale}:{locale:Locale}){
  const vi=locale==='vi';
  const sections=vi?[
    ['Tư vấn AI','Câu hỏi và tối đa bốn lượt trao đổi trước được gửi tới Google Gemini để tạo câu trả lời. Không gửi mật khẩu, giấy tờ hoặc dữ liệu nhạy cảm. Hội thoại chỉ nằm trong bộ nhớ trang; khi bạn tự nguyện gửi biểu mẫu và đồng ý liên hệ, các câu hỏi đã được tư vấn được lưu cùng yêu cầu. Tên và email trong biểu mẫu không tự động gửi tới AI.'],
    ['Liên kết TripC Map','Nút Bản đồ mở tripc.ai trong tab mới. Website đó quản lý dữ liệu, quyền vị trí và chính sách riêng. Website này không tự tải bản đồ hoặc gửi tọa độ sang nguồn địa điểm.'],
    ['Yêu cầu bạn gửi','Biểu mẫu lưu tên, email, chủ đề quan tâm và sự đồng ý liên hệ để TripC phản hồi. Gửi yêu cầu không xác nhận đặt chỗ hoặc thanh toán. Vui lòng không gửi thông tin nhạy cảm qua biểu mẫu.'],
    ['Hoạt động trên website','Website ghi nhận lượt xem trang, nhấp lời kêu gọi hành động và thông tin chiến dịch để đánh giá hiệu quả nội dung. Một mã phiên ẩn danh có thể được giữ trong trình duyệt. Nếu có thử nghiệm CTA, mã phân nhóm được lưu để bạn thấy một phiên bản nhất quán.'],
    ['Google Analytics','Khi được cấu hình, Google Analytics chỉ được tải sau khi bạn đồng ý với phân tích tùy chọn. Tên và email trong biểu mẫu không được gửi vào sự kiện Analytics của website. Bạn có thể thay đổi lựa chọn bằng nút cài đặt phân tích ở cuối trang.'],
    ['Cập nhật hoặc xóa yêu cầu','Liên hệ TripC qua cùng địa chỉ email bạn đã gửi để yêu cầu chỉnh sửa hoặc xóa thông tin. Thông tin liên hệ được dùng để xử lý yêu cầu của bạn, không tự động công khai trong cẩm nang.'],
  ]:[
    ['AI advice','Your question and up to four previous exchanges are sent to Google Gemini to generate a reply. Do not send passwords, documents or sensitive information. The conversation stays in page memory; when you voluntarily submit the contact form with consent, the questions discussed are saved with your request. Form names and emails are not automatically sent to the AI.'],
    ['TripC Map links','Map links open tripc.ai in a new tab. That website manages its own data, location permissions and privacy policy. This website does not load map tiles or send coordinates to a place provider.'],
    ['The request you send','The form saves your name, email, area of interest and permission to contact you so TripC can respond. A request does not confirm a booking or payment. Please do not send sensitive information through the form.'],
    ['Activity on this website','Page views, calls to action and campaign information are recorded to understand content performance. An anonymous session identifier may be kept in your browser. If a CTA test is running, an assignment identifier helps keep your experience consistent.'],
    ['Google Analytics','When configured, Google Analytics loads only after you allow optional analytics. Names and emails from the enquiry form are not included in the analytics events implemented by this website. You can change your choice using Analytics settings in the footer.'],
    ['Updating or removing a request','Contact TripC using the same email address you submitted to request an update or removal of your details. Contact information is used to handle your request and is not automatically published in the guides.'],
  ];
  return <div lang={locale} className="site-wrap"><SiteHeader locale={locale} alternatePath={privacyPath(vi?'en':'vi')}/><main className="article-wrap privacy-content"><p className="eyebrow">TRIPC / {vi?'THÔNG TIN CỦA BẠN':'YOUR INFORMATION'}</p><h1>{copy[locale].privacy}</h1><p>{vi?'Cách website sử dụng thông tin khi bạn khám phá hoặc gửi yêu cầu.':'How information is used when you explore the site or send an enquiry.'}</p>{sections.map(([title,text])=><section key={title}><h2>{title}</h2><p>{text}</p></section>)}</main><SiteFooter locale={locale}/></div>;
}
