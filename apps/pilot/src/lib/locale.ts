export type Locale = 'en' | 'vi';
export const homePath = (locale:Locale) => locale==='vi'?'/vi/':'/';
export const postPath = (slug:string,locale:Locale) => `${locale==='vi'?'/vi':''}/posts/${encodeURIComponent(slug)}/`;
export const privacyPath = (locale:Locale) => `${locale==='vi'?'/vi':''}/privacy/`;
export const copy = {
  en: {
    guides:'Explore guides',about:'How it works',ask:'Ask TripC',tag:'DA NANG, A LITTLE CLOSER',
    title:'Your next chapter in Da Nang.',intro:'Find your feet, discover your neighbourhood, and make everyday life feel a little more local.',
    browse:'Find your starting point',eyebrow:'A GOOD PLACE TO BEGIN',guideTitle:'Less searching. More living.',
    guideIntro:'Practical reads for your next move, your working day, and everything in between.',search:'Search guides',all:'All guides',
    housing:'Finding a home',work:'Work & connect',life:'Everyday life',travel:'Explore & travel',
    noGuides:'A new chapter is taking shape.',noGuidesText:'Our guide collection is on its way. In the meantime, tell us what you are looking for.',
    noResults:'No guide matches that search.',reset:'Clear filters',unavailable:'The guides are taking a short break.',unavailableText:'We cannot load the collection right now. Please try again shortly.',
    stepsTitle:'A little guidance goes a long way.',stepsIntro:'Start with a question. Leave with a clearer next step.',
    steps:[['Get your bearings','Browse practical guides to living, working and exploring in Da Nang.'],['Find your own rhythm','Read what is relevant to your plans, with sources you can follow.'],['Ask a local question','Send your question or interest to TripC when you need a starting point.']],
    faq:'A few things you might wonder',questions:[['Who is TripC for?','People exploring a visit, a move, or a new chapter in Da Nang. Start with the guides, or send us your area of interest.'],['Can I read in Vietnamese?','Yes. Switch between English and Vietnamese for the website interface. Published guides retain their original language.'],['Is sending a request a booking?','No. The form sends an enquiry to TripC. It does not confirm a booking, payment, availability or a service.']],
    contactEyebrow:'LET’S START WITH YOUR QUESTION',contactTitle:'What brings you to Da Nang?',contactIntro:'A new home, a change of scenery, or simply a little direction. Tell us where you would like to start.',
    name:'Name',email:'Email',interest:'What are you interested in?',consent:'I agree that TripC may contact me about this request.',privacy:'Privacy & data',send:'Send request',sending:'Sending…',
    sent:'Thanks — your request has been saved. TripC will reply to your email.',another:'Send another request',error:'We could not save your request. Please try again; your details are still here.',rateLimit:'Too many attempts. Please wait a little before trying again.',
    footer:'A little local knowledge. A better beginning.',read:'Read guide',minutes:'min read',back:'All guides',sources:'Sources & further reading',related:'Keep exploring',original:'Guides are shown in their original published language.',
  },
  vi: {
    guides:'Khám phá cẩm nang',about:'Cách hoạt động',ask:'Hỏi TripC',tag:'ĐÀ NẴNG, GẦN HƠN MỘT CHÚT',
    title:'Chương mới của bạn tại Đà Nẵng.',intro:'Làm quen nơi ở mới, khám phá khu phố và tận hưởng nhịp sống mỗi ngày như một người địa phương.',
    browse:'Tìm điểm bắt đầu',eyebrow:'BẮT ĐẦU TỪ ĐÂY',guideTitle:'Bớt tìm kiếm. Thêm trải nghiệm.',
    guideIntro:'Những bài đọc thiết thực về chỗ ở, công việc và cuộc sống thường ngày.',search:'Tìm cẩm nang',all:'Tất cả',
    housing:'Tìm nơi an cư',work:'Làm việc & kết nối',life:'Sống mỗi ngày',travel:'Khám phá & du lịch',
    noGuides:'Một chương mới đang được chuẩn bị.',noGuidesText:'Bộ cẩm nang đang được hoàn thiện. Trong lúc chờ, hãy cho TripC biết bạn đang quan tâm điều gì.',
    noResults:'Chưa có bài phù hợp với tìm kiếm này.',reset:'Xóa bộ lọc',unavailable:'Cẩm nang đang tạm gián đoạn.',unavailableText:'Chưa thể tải danh sách bài viết lúc này. Bạn vui lòng thử lại sau.',
    stepsTitle:'Thêm chút chỉ dẫn, rõ hơn đường đi.',stepsIntro:'Bắt đầu từ câu hỏi của bạn để tìm bước tiếp theo phù hợp.',
    steps:[['Làm quen thành phố','Khám phá cẩm nang về sinh sống, làm việc và trải nghiệm Đà Nẵng.'],['Tìm nhịp sống riêng','Đọc nội dung phù hợp với kế hoạch của bạn, cùng nguồn để tìm hiểu thêm.'],['Gửi điều bạn quan tâm','Khi cần một điểm bắt đầu, hãy gửi câu hỏi hoặc chủ đề bạn quan tâm cho TripC.']],
    faq:'Có thể bạn đang thắc mắc',questions:[['TripC dành cho ai?','Dành cho những ai đang dự định ghé thăm, chuyển đến hoặc bắt đầu một hành trình mới tại Đà Nẵng.'],['Tôi có thể đọc bằng tiếng Anh không?','Có. Bạn có thể chuyển giao diện giữa tiếng Việt và tiếng Anh. Bài viết được giữ nguyên ngôn ngữ đã xuất bản.'],['Gửi yêu cầu có phải đặt dịch vụ không?','Không. Biểu mẫu chỉ gửi yêu cầu đến TripC, chưa xác nhận đặt chỗ, thanh toán, tình trạng còn chỗ hoặc dịch vụ.']],
    contactEyebrow:'BẮT ĐẦU BẰNG MỘT CÂU HỎI',contactTitle:'Điều gì đưa bạn đến Đà Nẵng?',contactIntro:'Một nơi ở mới, một trải nghiệm khác hay vài lời chỉ dẫn. Hãy cho TripC biết bạn muốn bắt đầu từ đâu.',
    name:'Họ và tên',email:'Email',interest:'Bạn đang quan tâm điều gì?',consent:'Tôi đồng ý để TripC liên hệ về yêu cầu này.',privacy:'Quyền riêng tư & dữ liệu',send:'Gửi yêu cầu',sending:'Đang gửi…',
    sent:'Cảm ơn bạn — yêu cầu đã được lưu. TripC sẽ phản hồi qua email của bạn.',another:'Gửi yêu cầu khác',error:'Chưa thể lưu yêu cầu. Bạn vui lòng thử lại; thông tin đã nhập vẫn được giữ.',rateLimit:'Bạn đã thử quá nhiều lần. Vui lòng đợi một chút rồi thử lại.',
    footer:'Hiểu thêm địa phương. Khởi đầu thuận lợi hơn.',read:'Đọc cẩm nang',minutes:'phút đọc',back:'Tất cả cẩm nang',sources:'Nguồn & thông tin đọc thêm',related:'Tiếp tục khám phá',original:'Bài viết được hiển thị bằng ngôn ngữ xuất bản gốc.',
  },
} as const;
