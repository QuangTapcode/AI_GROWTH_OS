export type Language = "vi" | "en";

export interface Translations {
  common: {
    appName: string;
    vi: string;
    en: string;
    loading: string;
    save: string;
    cancel: string;
    close: string;
    back: string;
    edit: string;
    delete: string;
    filter: string;
    search: string;
    all: string;
    status: string;
    priority: string;
    actions: string;
    date: string;
    refresh: string;
    version: string;
    export: string;
    details: string;
    copied: string;
    copyJson: string;
    rawPayload: string;
    jsonSchemaFormat: string;
    words: string;
    characters: string;
    press: string;
    toDiscard: string;
  };
  header: {
    searchPlaceholderOverview: string;
    searchPlaceholderReview: string;
    searchPlaceholderDefault: string;
    allSystemsOperational: string;
    notifications: string;
    filterAndSettings: string;
    profileAndSettings: string;
    owner: string;
    switchLanguage: string;
  };
  sidebar: {
    overview: string;
    workflows: string;
    artifacts: string;
    reviewQueue: string;
    distribution: string;
    growthResults: string;
    workspaceIntegrations: string;
    growthWorkspace: string;
    ecotourismLocalTours: string;
    culinaryFoodTourism: string;
    active: string;
    production: string;
    staging: string;
    switchWorkspace: string;
    createNewWorkspace: string;
    growthKnowledge: string;
    growthKnowledgeDesc: string;
    connectionStatus: string;
    connectedChannels: string;
    helpDocs: string;
    logout: string;
    engineAuto: string;
  };
  auth: {
    welcomeBack1: string;
    welcomeBack2: string;
    emailLabel: string;
    emailPlaceholder: string;
    emailRequired: string;
    emailInvalidGmail: string;
    signIn: string;
    signingIn: string;
    or: string;
    signInGoogle: string;
    copyright: string;
    termsOfService: string;
    privacyPolicy: string;
    heroGrowthTarget: string;
    heroQualifiedTraffic: string;
    heroSeoScore: string;
    heroContent: string;
    heroOnTrack: string;
    heroMonthly: string;
    heroLiveProjection: string;
    heroAvgGrowth: string;
    heroQuote: string;
    heroSubtitle: string;
  };
  dashboard: {
    commandCenter: string;
    overviewTitle: string;
    overviewDesc: string;
    last30Days: string;
    refreshMetrics: string;
    kpi: {
      qualifiedTraffic: string;
      organicClicks: string;
      newUsers: string;
      qualifiedLeads: string;
      publishedContent: string;
      prev: string;
      vs: string;
      demoFootnote: string;
    };
    chart: {
      title: string;
      vsPrev: string;
      daily: string;
      weekly: string;
      monthly: string;
      currentPeriod: string;
      previous30Days: string;
      peak: string;
      visits: string;
    };
    agentActivity: {
      title: string;
      viewAllTasks: string;
      running: string;
      completed: string;
      review: string;
      failed: string;
      needsReview: string;
      seoAgent: string;
      seoAction: string;
      contentAgent: string;
      contentAction: string;
      researchAgent: string;
      researchAction: string;
      distributionAgent: string;
      distributionAction: string;
      minAgo: string;
      hourAgo: string;
      hoursAgo: string;
    };
    actionCenter: {
      title: string;
      subtitle: string;
      actionableCount: string;
      high: string;
      medium: string;
      channel: string;
      item1Title: string;
      item1Desc: string;
      item1Btn: string;
      item2Title: string;
      item2Desc: string;
      item2Btn: string;
      item3Title: string;
      item3Desc: string;
      item3Btn: string;
    };
    pipeline: {
      title: string;
      subtitle: string;
      pipelineVersion: string;
      stage1: string;
      stage1Status: string;
      stage2: string;
      stage2Status: string;
      stage3: string;
      stage3Status: string;
      stage4: string;
      stage4Status: string;
      stage5: string;
      stage5Status: string;
      stage6: string;
      stage6Status: string;
      cycleVelocity: string;
      velocityOnSchedule: string;
    };
    recommendations: {
      title: string;
      badge: string;
      dismiss: string;
      hypothesis: string;
      confidence: string;
      rec1Title: string;
      rec1Hypo: string;
      rec1Btn: string;
      rec2Title: string;
      rec2Hypo: string;
      rec2Btn: string;
      rec3Title: string;
      rec3Hypo: string;
      rec3Btn: string;
    };
  };
  workflows: {
    pageTitle: string;
    prototypeBadge: string;
    pageSubtitle: string;
    executionHistory: string;
    filterStages: string;
    allStages: string;
    allAgents: string;
    allStatuses: string;
    pipelineCardTitle: string;
    pipelineSubtitle: string;
    viewTrace: string;
    stageDetails: string;
    taskDetails: string;
    logs: string;
    artifactsCreated: string;
    inspectReviewQueue: string;
    close: string;
    kpi: {
      activeRuns: string;
      completedTasks: string;
      pendingReview: string;
      successRate: string;
    };
    table: {
      task: string;
      agent: string;
      stage: string;
      priority: string;
      status: string;
      duration: string;
      action: string;
      viewDetails: string;
      searchPlaceholder: string;
      statusRunning: string;
      statusCompleted: string;
      statusReview: string;
      statusFailed: string;
      statusInQueue: string;
    };
    modal: {
      statusAndProgress: string;
      description: string;
      liveLogs: string;
      close: string;
      openReviewQueue: string;
      inProgress: string;
      completed: string;
      blocked: string;
    };
  };
  reviewQueue: {
    pageTitle: string;
    badge: string;
    subtitle: string;
    pendingCount: string;
    approvedToday: string;
    rejectedCount: string;
    tabs: {
      all: string;
      articles: string;
      social: string;
      seo: string;
      landingPages: string;
    };
    detail: {
      pendingApproval: string;
      approved: string;
      rejected: string;
      targetCluster: string;
      targetLocale: string;
      viewJson: string;
      expandDocument: string;
      section1Title: string;
      section2Title: string;
      humanApprovalNotice: string;
      rejectPlaceholder: string;
      rejectBtn: string;
      approveBtn: string;
      approveSuccess: string;
      rejectSuccess: string;
      jsonPayloadTitle: string;
    };
    items: {
      confidence: string;
      estimatedImpact: string;
      needsHumanReview: string;
    };
  };
  artifacts: {
    pageTitle: string;
    subtitle: string;
    searchPlaceholder: string;
    filterAll: string;
    filterArticles: string;
    filterReports: string;
    filterSocial: string;
    filterSeo: string;
    deliverableDetails: string;
    editArtifact: string;
    exportJson: string;
    sendToReview: string;
    versionHistory: string;
    versionsCount: string;
    lastUpdated: string;
    authorAgent: string;
    targetKeyword: string;
    targetAudience: string;
    savedToast: string;
    sentToReviewToast: string;
    exportedToast: string;
    modalTitle: string;
    modalSubtitle: string;
    documentContentLabel: string;
    titleLabel: string;
    saveChanges: string;
    discard: string;
    aiWorkspaceBadge: string;
    filterListPlaceholder: string;
    deliverablesTitle: string;
    noDeliverablesFound: string;
    statusComplete: string;
    statusInProgress: string;
    statusValidated: string;
    statusQueued: string;
    selectPrompt: string;
    executiveInsight: string;
    aiPipeline: string;
    deterministic: string;
    pipelineIdLabel: string;
    autonomousWorkflow: string;
    completedByAgent: string;
    activeOutputNode: string;
    requiresReview: string;
    agentLabel: string;
    viewJson: string;
    versionControlNotice: string;
    versionControlDesc: string;
    sendForReviewBtn: string;
  };
  distribution: {
    pageTitle: string;
    eyebrow: string;
    subtitle: string;
    attentionRequired: string;
    allOperational: string;
    killSwitchEngaged: string;
    killSwitchDisengaged: string;
    auditEndpoints: string;
    pipelineTitle: string;
    pipelineSubtitle: string;
    activeWorker: string;
    tasksTitle: string;
    tasksSubtitle: string;
    endpointsTitle: string;
    endpointsSubtitle: string;
    reconnect: string;
    schedulePost: string;
  };
  growthResults: {
    pageTitle: string;
    subtitle: string;
    period7d: string;
    period30d: string;
    period90d: string;
    refresh: string;
    exportCsv: string;
    northStar: string;
    trafficPerformance: string;
    trafficSubtitle: string;
    trafficSources: string;
    channelPerformance: string;
    conversionFunnel: string;
    serpPerformance: string;
  };
  workspaceIntegrations: {
    pageTitle: string;
    subtitle: string;
    eyebrow: string;
    exportConfig: string;
    saveChanges: string;
    tabWorkspace: string;
    tabIntegrations: string;
    overviewTitle: string;
    brandVoiceTitle: string;
    teamTitle: string;
    goalsTitle: string;
  };
}

export const translations: Record<Language, Translations> = {
  vi: {
    common: {
      appName: "AI Growth OS",
      vi: "Tiếng Việt",
      en: "English",
      loading: "Đang tải...",
      save: "Lưu",
      cancel: "Hủy",
      close: "Đóng",
      back: "Quay lại",
      edit: "Chỉnh sửa",
      delete: "Xóa",
      filter: "Bộ lọc",
      search: "Tìm kiếm",
      all: "Tất cả",
      status: "Trạng thái",
      priority: "Ưu tiên",
      actions: "Thao tác",
      date: "Ngày",
      refresh: "Làm mới",
      version: "Phiên bản",
      export: "Xuất tệp",
      details: "Chi tiết",
      copied: "Đã sao chép!",
      copyJson: "Sao chép JSON",
      rawPayload: "Dữ liệu thô",
      jsonSchemaFormat: "Định dạng: JSON Schema 2020-12",
      words: "từ",
      characters: "ký tự",
      press: "Nhấn",
      toDiscard: "để hủy",
    },
    header: {
      searchPlaceholderOverview: "Tìm kiếm mọi thứ...",
      searchPlaceholderReview: "Tìm kiếm quy trình, nút, nhật ký...",
      searchPlaceholderDefault: "Tìm kiếm...",
      allSystemsOperational: "Tất cả hệ thống hoạt động",
      notifications: "Thông báo",
      filterAndSettings: "Cài đặt & bộ lọc",
      profileAndSettings: "Hồ sơ & Cài đặt",
      owner: "Chủ sở hữu",
      switchLanguage: "Chuyển đổi ngôn ngữ",
    },
    sidebar: {
      overview: "Tổng quan",
      workflows: "Quy trình & Tác vụ",
      artifacts: "Tài nguyên",
      reviewQueue: "Hàng đợi duyệt",
      distribution: "Phân phối",
      growthResults: "Kết quả tăng trưởng",
      workspaceIntegrations: "Không gian & Tích hợp",
      growthWorkspace: "Không gian tăng trưởng",
      ecotourismLocalTours: "Du lịch sinh thái & Tour địa phương",
      culinaryFoodTourism: "Ẩm thực & Tour ẩm thực",
      active: "Đang chạy",
      production: "Môi trường chính",
      staging: "Thử nghiệm",
      switchWorkspace: "Chuyển không gian làm việc",
      createNewWorkspace: "Tạo không gian mới",
      growthKnowledge: "Tri thức tăng trưởng",
      growthKnowledgeDesc: "Ngữ cảnh kinh doanh & giọng điệu",
      connectionStatus: "Trạng thái kết nối",
      connectedChannels: "Kênh đã kết nối",
      helpDocs: "Trợ giúp & tài liệu",
      logout: "Đăng xuất",
      engineAuto: "TỰ ĐỘNG",
    },
    auth: {
      welcomeBack1: "Chào mừng",
      welcomeBack2: "trở lại",
      emailLabel: "Email",
      emailPlaceholder: "Nhập email của bạn",
      emailRequired: "Vui lòng nhập địa chỉ email",
      emailInvalidGmail: "Vui lòng nhập đúng định dạng Gmail (ví dụ: example@gmail.com)",
      signIn: "Đăng nhập",
      signingIn: "Đang đăng nhập...",
      or: "hoặc",
      signInGoogle: "Đăng nhập với Google",
      copyright: "© 2025 AI Growth OS Inc.",
      termsOfService: "Điều khoản dịch vụ",
      privacyPolicy: "Chính sách quyền riêng tư",
      heroGrowthTarget: "MỤC TIÊU TĂNG TRƯỞNG",
      heroQualifiedTraffic: "Lưu lượng chuẩn",
      heroSeoScore: "Điểm SEO",
      heroContent: "Nội dung",
      heroOnTrack: "Đúng tiến độ",
      heroMonthly: "Hàng tháng",
      heroLiveProjection: "Dự phóng tăng trưởng tự nhiên trực tiếp",
      heroAvgGrowth: "Tăng trưởng TB hàng tháng",
      heroQuote: "Tự động hóa hành trình tăng trưởng nội dung du lịch và lưu lượng tự nhiên với AI Agents thông minh.",
      heroSubtitle: "Hệ điều hành tăng trưởng tự động hóa cho du lịch và nội dung",
    },
    dashboard: {
      commandCenter: "TRUNG TÂM ĐIỀU HÀNH TĂNG TRƯỞNG",
      overviewTitle: "Tổng quan",
      overviewDesc: "Theo dõi hiệu suất tăng trưởng, hoạt động của AI và các hành động tiếp theo cho {workspace}.",
      last30Days: "30 ngày qua",
      refreshMetrics: "Làm mới chỉ số",
      kpi: {
        qualifiedTraffic: "Lưu lượng chuẩn",
        organicClicks: "Lượt nhấp tự nhiên",
        newUsers: "Người dùng mới",
        qualifiedLeads: "Khách hàng tiềm năng",
        publishedContent: "Nội dung đã xuất bản",
        prev: "kỳ trước",
        vs: "so với",
        demoFootnote: "Dữ liệu minh họa cho không gian làm việc {workspace}",
      },
      chart: {
        title: "Xu hướng lưu lượng chuẩn",
        vsPrev: "+18.6% so với kỳ trước",
        daily: "ngày",
        weekly: "tuần",
        monthly: "tháng",
        currentPeriod: "Kỳ hiện tại (30 ngày qua)",
        previous30Days: "30 ngày trước",
        peak: "Đỉnh điểm",
        visits: "lượt truy cập",
      },
      agentActivity: {
        title: "Hoạt động AI Agent",
        viewAllTasks: "Xem tất cả tác vụ →",
        running: "Đang chạy",
        completed: "Hoàn thành",
        review: "Chờ duyệt",
        failed: "Thất bại",
        needsReview: "Cần duyệt",
        seoAgent: "Agent SEO",
        seoAction: "Tối ưu thẻ mô tả cho cẩm nang Đà Nẵng",
        contentAgent: "Agent Nội dung",
        contentAction: "Soạn thảo bài blog du lịch Đà Nẵng 3/5",
        researchAgent: "Agent Nghiên cứu",
        researchAction: "Phân tích nhu cầu tìm kiếm mùa cao điểm Q4",
        distributionAgent: "Agent Phân phối",
        distributionAction: "Phân phối danh sách khách sạn lên LinkedIn",
        minAgo: "phút trước",
        hourAgo: "giờ trước",
        hoursAgo: "giờ trước",
      },
      actionCenter: {
        title: "Trung tâm tác vụ",
        subtitle: "Các quyết định và tác vụ cần bạn chú ý (4 đang chờ)",
        actionableCount: "4 Cần xử lý",
        high: "CAO",
        medium: "TRUNG BÌNH",
        channel: "KÊNH",
        item1Title: "Duyệt 4 nội dung đang chờ",
        item1Desc: "3 bài viết và 1 bài tổng quan điểm đến do Agent Nội dung soạn thảo đang chờ ký duyệt thông tin.",
        item1Btn: "Duyệt ngay",
        item2Title: "Phê duyệt đề xuất SEO",
        item2Desc: "Mở rộng cụm từ khóa & đánh dấu cấu trúc cho cẩm nang Miền Trung.",
        item2Btn: "Mở tác vụ",
        item3Title: "Kết nối lại kênh phân phối",
        item3Desc: "Token OAuth trang LinkedIn đã hết hạn 2 ngày trước; 3 lượt chia sẻ tự động tạm dừng.",
        item3Btn: "Kết nối lại",
      },
      pipeline: {
        title: "Quy trình tăng trưởng",
        subtitle: "Các giai đoạn quy trình tự động từ khám phá đến tác động chuẩn",
        pipelineVersion: "Quy trình TripC v2.4",
        stage1: "Nghiên cứu",
        stage1Status: "đã xác định",
        stage2: "Cơ hội",
        stage2Status: "đã phê duyệt",
        stage3: "Nội dung",
        stage3Status: "đang thực hiện",
        stage4: "Phê duyệt",
        stage4Status: "chờ người duyệt",
        stage5: "Phân phối",
        stage5Status: "đã lên lịch",
        stage6: "Kết quả",
        stage6Status: "tăng lưu lượng",
        cycleVelocity: "Tốc độ chu kỳ tổng thể",
        velocityOnSchedule: "82% đúng tiến độ",
      },
      recommendations: {
        title: "Đề xuất hành động tiếp theo",
        badge: "Trí tuệ Tăng trưởng AI",
        dismiss: "Bỏ qua đề xuất ✕",
        hypothesis: "Giả thuyết:",
        confidence: "Độ tin cậy:",
        rec1Title: 'Nhắm mục tiêu truy vấn có ý định cao "Khách sạn boutique đẹp nhất Đà Nẵng"',
        rec1Hypo: "Tiềm năng +1.400 lượt truy cập tự nhiên hàng tháng nhờ mức độ cạnh tranh SERP thấp và ý định thương mại cao.",
        rec1Btn: "Khám phá cơ hội",
        rec2Title: "Làm mới bài cẩm nang visa Việt Nam Q2 đang sụt giảm",
        rec2Hypo: "Lượt hiển thị tự nhiên giảm -14% sau khi cập nhật chính sách visa; làm mới nội dung giúp hồi phục ~620 lượt truy cập.",
        rec2Btn: "Tạo tác vụ",
        rec3Title: "Tự động tạo bài đăng mạng xã hội cho cẩm nang Hội An",
        rec3Hypo: "Dự kiến 280-350 lượt truy cập giới thiệu qua các kênh phân phối Twitter/X và LinkedIn.",
        rec3Btn: "Khởi chạy quy trình",
      },
    },
    workflows: {
      pageTitle: "Vận hành Tăng trưởng AI",
      prototypeBadge: "Dữ liệu mẫu • {workspace} AI Growth OS",
      pageSubtitle: "Giám sát quy trình tăng trưởng tự động, thực thi agent và các tác vụ cần chú ý.",
      executionHistory: "Lịch sử thực thi",
      filterStages: "Bộ lọc giai đoạn",
      allStages: "Tất cả giai đoạn",
      allAgents: "Tất cả Agent",
      allStatuses: "Tất cả trạng thái",
      pipelineCardTitle: "Đợt chạy quy trình đang hoạt động",
      pipelineSubtitle: "Phân tích cơ hội SEO & Tạo nội dung Miền Trung",
      viewTrace: "Xem dấu vết thực thi",
      stageDetails: "Chi tiết giai đoạn",
      taskDetails: "Chi tiết tác vụ",
      logs: "Nhật ký thực thi",
      artifactsCreated: "Tài nguyên tạo ra",
      inspectReviewQueue: "Xem trong Hàng đợi duyệt",
      close: "Đóng",
      kpi: {
        activeRuns: "Đợt chạy đang hoạt động",
        completedTasks: "Tác vụ đã hoàn thành",
        pendingReview: "Đang chờ xem xét",
        successRate: "Tỷ lệ thành công",
      },
      table: {
        task: "Tác vụ",
        agent: "Agent",
        stage: "Giai đoạn",
        priority: "Ưu tiên",
        status: "Trạng thái",
        duration: "Thời lượng",
        action: "Thao tác",
        viewDetails: "Chi tiết",
        searchPlaceholder: "Tìm kiếm tác vụ theo tên, agent...",
        statusRunning: "Đang chạy",
        statusCompleted: "Hoàn thành",
        statusReview: "Cần duyệt",
        statusFailed: "Thất bại",
        statusInQueue: "Trong hàng đợi",
      },
      modal: {
        statusAndProgress: "TRẠNG THÁI & TIẾN ĐỘ",
        description: "MÔ TẢ",
        liveLogs: "NHẬT KÝ THỰC THI TRỰC TIẾP",
        close: "Đóng",
        openReviewQueue: "Xem trong Hàng đợi duyệt",
        inProgress: "Đang thực hiện",
        completed: "Đã hoàn thành",
        blocked: "Bị chặn",
      },
    },
    reviewQueue: {
      pageTitle: "Hàng đợi duyệt",
      badge: "Kiểm soát Cấp độ 1",
      subtitle: "Xem xét các kết quả do AI tạo ra cần bạn phê duyệt trước khi đưa vào sản xuất tự động.",
      pendingCount: "{count} đang chờ",
      approvedToday: "{count} đã duyệt hôm nay",
      rejectedCount: "{count} đã từ chối",
      tabs: {
        all: "Tất cả",
        articles: "Bài viết",
        social: "Mạng xã hội",
        seo: "SEO",
        landingPages: "Trang đích",
      },
      detail: {
        pendingApproval: "Chờ phê duyệt",
        approved: "Đã phê duyệt",
        rejected: "Đã từ chối",
        targetCluster: "Cụm chủ đề mục tiêu:",
        targetLocale: "Khu vực mục tiêu:",
        viewJson: "Xem dữ liệu JSON",
        expandDocument: "Mở rộng toàn bộ tài liệu",
        section1Title: "Tóm tắt điều hành & Khoảng trống thị trường",
        section2Title: "Các cụm chủ đề ưu tiên & Khuyến nghị",
        humanApprovalNotice: "Cần con người phê duyệt trước hành động tự động:",
        rejectPlaceholder: "Lý do từ chối (góp ý tùy chọn để AI hiệu chỉnh lại)...",
        rejectBtn: "✕ Từ chối",
        approveBtn: "✓ Phê duyệt để phân phối",
        approveSuccess: "Đã phê duyệt thành công! Đã đưa vào hàng chờ xuất bản CMS tự động.",
        rejectSuccess: "Đã đánh dấu từ chối. Đã gửi yêu cầu hiệu chỉnh đến Agent.",
        jsonPayloadTitle: "Dữ liệu JSON",
      },
      items: {
        confidence: "Độ tin cậy:",
        estimatedImpact: "Tác động dự kiến:",
        needsHumanReview: "Cần con người duyệt",
      },
    },
    artifacts: {
      pageTitle: "Thư viện Tài nguyên & Nội dung",
      subtitle: "Duyệt, chỉnh sửa, xuất và quản lý các sản phẩm tăng trưởng do AI tạo ra.",
      searchPlaceholder: "Tìm kiếm theo tiêu đề, danh mục, từ khóa...",
      filterAll: "Tất cả",
      filterArticles: "Bài viết",
      filterReports: "Báo cáo",
      filterSocial: "Mạng xã hội",
      filterSeo: "SEO",
      deliverableDetails: "Chi tiết sản phẩm",
      editArtifact: "Chỉnh sửa tài nguyên",
      exportJson: "Xuất JSON",
      sendToReview: "Gửi vào hàng đợi duyệt",
      versionHistory: "Lịch sử phiên bản",
      versionsCount: "phiên bản",
      lastUpdated: "Cập nhật lần cuối",
      authorAgent: "Agent tác giả",
      targetKeyword: "Từ khóa mục tiêu",
      targetAudience: "Đối tượng độc giả",
      savedToast: "Đã lưu thay đổi! Đã tạo bản chụp phiên bản mới.",
      sentToReviewToast: "Đã gửi tài nguyên vào Hàng đợi duyệt thành công!",
      exportedToast: "Đã xuất gói dữ liệu thành công.",
      modalTitle: "Chỉnh sửa tài nguyên",
      modalSubtitle: "Cập nhật nội dung tài nguyên trước khi gửi vào hàng đợi duyệt.",
      documentContentLabel: "Nội dung tài liệu",
      titleLabel: "Tiêu đề tài nguyên",
      saveChanges: "Lưu thay đổi",
      discard: "Hủy bỏ",
      aiWorkspaceBadge: "Không gian làm việc AI",
      filterListPlaceholder: "Lọc danh sách...",
      deliverablesTitle: "SẢN PHẨM BÀN GIAO",
      noDeliverablesFound: "Không tìm thấy sản phẩm nào.",
      statusComplete: "Hoàn thành",
      statusInProgress: "Đang thực hiện",
      statusValidated: "Đã xác thực",
      statusQueued: "Trong hàng đợi",
      selectPrompt: "Chọn một sản phẩm bàn giao ở cột bên trái để kiểm tra nội dung.",
      executiveInsight: "Nhận định điều hành:",
      aiPipeline: "Quy trình AI",
      deterministic: "Xác định",
      pipelineIdLabel: "Mã quy trình:",
      autonomousWorkflow: "QUY TRÌNH THỰC THI TỰ ĐỘNG",
      completedByAgent: "Agent đã hoàn thành",
      activeOutputNode: "Nút kết quả hiện tại",
      requiresReview: "Cần xem xét",
      agentLabel: "Agent:",
      viewJson: "Xem JSON",
      versionControlNotice: "Kiểm soát phiên bản:",
      versionControlDesc: "Lưu thay đổi sẽ lưu bản nháp này thành bản chụp phiên bản mới ({version}) mà không ghi đè lên các mốc dữ liệu lịch sử.",
      sendForReviewBtn: "Gửi duyệt",
    },
    distribution: {
      pageTitle: "Trung tâm Điều khiển Phân phối",
      eyebrow: "TRUNG TÂM TỰ ĐỘNG HÓA AI",
      subtitle: "Tự động phân phối đa kênh, kiểm tra cổng an toàn và giám sát chứng thực cho mạng lưới TripC.",
      attentionRequired: "Cần chú ý",
      allOperational: "Tất cả hệ thống hoạt động bình thường",
      killSwitchEngaged: "Ngắt khẩn cấp: Đang kích hoạt (Tạm dừng)",
      killSwitchDisengaged: "Ngắt khẩn cấp: Đang tắt",
      auditEndpoints: "Kiểm tra kênh",
      pipelineTitle: "Quy trình Xuất bản & Thực thi Tác vụ",
      pipelineSubtitle: "Chọn một giai đoạn quy trình để kiểm tra cổng phê duyệt, phân công Agent và lọc các tác vụ liên quan.",
      activeWorker: "Worker đang chạy:",
      tasksTitle: "Tác vụ Xuất bản & Lịch Thực thi",
      tasksSubtitle: "Theo dõi trạng thái xuất bản, thời gian dự kiến và nhật ký hoạt động.",
      endpointsTitle: "Mạng lưới Kênh Phân phối & Giám sát Xác thực",
      endpointsSubtitle: "Theo dõi tình trạng kết nối OAuth, webhook CMS và thời hạn token của các kênh liên kết.",
      reconnect: "Kết nối lại",
      schedulePost: "+ Lên lịch bài đăng",
    },
    growthResults: {
      pageTitle: "Kết quả Tăng trưởng",
      subtitle: "Đo lường hiệu suất, phân tích tác động và nhận diện các cơ hội tăng trưởng tiếp theo.",
      period7d: "7 ngày",
      period30d: "30 ngày",
      period90d: "90 ngày",
      refresh: "Làm mới",
      exportCsv: "Xuất CSV",
      northStar: "Lượng truy cập đủ chuẩn tăng thêm",
      trafficPerformance: "Hiệu suất Lưu lượng Truy cập",
      trafficSubtitle: "So sánh chu kỳ hiện tại với giai đoạn trước đó",
      trafficSources: "Nguồn Lưu lượng",
      channelPerformance: "Hiệu suất theo Kênh",
      conversionFunnel: "Phễu Chuyển đổi",
      serpPerformance: "Hiệu suất Từ khóa SERP",
    },
    workspaceIntegrations: {
      pageTitle: "Không gian làm việc & Tích hợp",
      subtitle: "Quản lý bối cảnh doanh nghiệp cốt lõi, hướng dẫn giọng văn thương hiệu, phân quyền nhóm và luồng dữ liệu bên ngoài.",
      eyebrow: "AI GROWTH OS • TRÍ TUỆ KHÔNG GIAN LÀM VIỆC",
      exportConfig: "Xuất cấu hình",
      saveChanges: "Lưu thay đổi",
      tabWorkspace: "Hồ sơ Không gian & Giọng văn Thương hiệu",
      tabIntegrations: "Tích hợp & Luồng Dữ liệu Đã kết nối",
      overviewTitle: "Tổng quan Không gian làm việc",
      brandVoiceTitle: "Giọng văn Thương hiệu & Quy tắc Biên tập",
      teamTitle: "Thành viên Nhóm & Phân quyền Truy cập",
      goalsTitle: "Mục tiêu Tăng trưởng & Chỉ số Định hướng",
    },
  },
  en: {
    common: {
      appName: "AI Growth OS",
      vi: "Tiếng Việt",
      en: "English",
      loading: "Loading...",
      save: "Save",
      cancel: "Cancel",
      close: "Close",
      back: "Back",
      edit: "Edit",
      delete: "Delete",
      filter: "Filter",
      search: "Search",
      all: "All",
      status: "Status",
      priority: "Priority",
      actions: "Actions",
      date: "Date",
      refresh: "Refresh",
      version: "Version",
      export: "Export",
      details: "Details",
      copied: "Copied!",
      copyJson: "Copy JSON",
      rawPayload: "Raw Payload",
      jsonSchemaFormat: "Format: JSON Schema 2020-12",
      words: "words",
      characters: "characters",
      press: "Press",
      toDiscard: "to discard",
    },
    header: {
      searchPlaceholderOverview: "Search anything...",
      searchPlaceholderReview: "Search pipelines, nodes, logs...",
      searchPlaceholderDefault: "Search...",
      allSystemsOperational: "All systems operational",
      notifications: "Notifications",
      filterAndSettings: "Filter and system settings",
      profileAndSettings: "Profile & Settings",
      owner: "Owner",
      switchLanguage: "Switch language",
    },
    sidebar: {
      overview: "Overview",
      workflows: "Workflows & Tasks",
      artifacts: "Artifacts",
      reviewQueue: "Review Queue",
      distribution: "Distribution",
      growthResults: "Growth Results",
      workspaceIntegrations: "Workspace & Integrations",
      growthWorkspace: "Growth workspace",
      ecotourismLocalTours: "Ecotourism & Local Tours",
      culinaryFoodTourism: "Culinary & Food Tourism",
      active: "Active",
      production: "Production",
      staging: "Staging",
      switchWorkspace: "Switch workspace",
      createNewWorkspace: "Create new workspace",
      growthKnowledge: "Growth Knowledge",
      growthKnowledgeDesc: "Business context & voice",
      connectionStatus: "Connection status",
      connectedChannels: "Connected channels",
      helpDocs: "Help & documentation",
      logout: "Logout",
      engineAuto: "AUTO",
    },
    auth: {
      welcomeBack1: "Welcome",
      welcomeBack2: "back",
      emailLabel: "Email",
      emailPlaceholder: "Enter your email",
      emailRequired: "Please enter an email address",
      emailInvalidGmail: "Please enter a valid Gmail address (e.g. example@gmail.com)",
      signIn: "Sign in",
      signingIn: "Signing in...",
      or: "or",
      signInGoogle: "Sign in with Google",
      copyright: "© 2025 AI Growth OS Inc.",
      termsOfService: "Terms of Service",
      privacyPolicy: "Privacy Policy",
      heroGrowthTarget: "GROWTH TARGET",
      heroQualifiedTraffic: "Qualified traffic",
      heroSeoScore: "SEO Score",
      heroContent: "Content",
      heroOnTrack: "On Track",
      heroMonthly: "Monthly",
      heroLiveProjection: "Live organic projection",
      heroAvgGrowth: "Avg Monthly Growth",
      heroQuote: "Automate your travel content growth journey and organic traffic with intelligent AI Agents.",
      heroSubtitle: "Autonomous growth operating system for tourism and content",
    },
    dashboard: {
      commandCenter: "GROWTH COMMAND CENTER",
      overviewTitle: "Overview",
      overviewDesc: "Monitor growth performance, AI activity, and the next actions for {workspace}.",
      last30Days: "Last 30 days",
      refreshMetrics: "Refresh metrics",
      kpi: {
        qualifiedTraffic: "Qualified Traffic",
        organicClicks: "Organic Clicks",
        newUsers: "New Users",
        qualifiedLeads: "Qualified Leads",
        publishedContent: "Published Content",
        prev: "prev.",
        vs: "vs.",
        demoFootnote: "Illustrative demo data for {workspace} workspace",
      },
      chart: {
        title: "Qualified Traffic Trend",
        vsPrev: "+18.6% vs prev.",
        daily: "daily",
        weekly: "weekly",
        monthly: "monthly",
        currentPeriod: "Current period (Last 30d)",
        previous30Days: "Previous 30 days",
        peak: "Peak",
        visits: "visits",
      },
      agentActivity: {
        title: "AI Agent Activity",
        viewAllTasks: "View all tasks →",
        running: "Running",
        completed: "Completed",
        review: "Review",
        failed: "Failed",
        needsReview: "Needs review",
        seoAgent: "SEO Agent",
        seoAction: "Optimize description tags for Da Nang guide",
        contentAgent: "Content Agent",
        contentAction: "Draft Da Nang travel blog 3/5",
        researchAgent: "Research Agent",
        researchAction: "Analyze seasonal query demand Q4",
        distributionAgent: "Distribution Agent",
        distributionAction: "Syndicate hotel curation to LinkedIn",
        minAgo: "m ago",
        hourAgo: "h ago",
        hoursAgo: "h ago",
      },
      actionCenter: {
        title: "Action Center",
        subtitle: "Decisions and tasks requiring your attention (4 pending)",
        actionableCount: "4 Actionable",
        high: "HIGH",
        medium: "MEDIUM",
        channel: "CHANNEL",
        item1Title: "Review 4 pending content items",
        item1Desc: "3 articles and 1 destination overview drafted by Content Agent awaiting factual sign-off.",
        item1Btn: "Review now",
        item2Title: "Approve SEO recommendations",
        item2Desc: "Schema markup & keyword cluster expansion on Central Vietnam guides.",
        item2Btn: "Open task",
        item3Title: "Reconnect distribution channel",
        item3Desc: "LinkedIn Pages OAuth token expired 2 days ago; 3 automated shares paused.",
        item3Btn: "Reconnect",
      },
      pipeline: {
        title: "Growth Pipeline",
        subtitle: "Autonomous workflow stages from discovery to qualified impact",
        pipelineVersion: "TripC Pipeline v2.4",
        stage1: "Research",
        stage1Status: "identified",
        stage2: "Opportunity",
        stage2Status: "approved",
        stage3: "Content",
        stage3Status: "in progress",
        stage4: "Review",
        stage4Status: "awaiting human",
        stage5: "Distribute",
        stage5Status: "scheduled",
        stage6: "Results",
        stage6Status: "traffic lift",
        cycleVelocity: "Overall cycle velocity",
        velocityOnSchedule: "82% on schedule",
      },
      recommendations: {
        title: "Recommended next actions",
        badge: "AI Growth Intelligence",
        dismiss: "Dismiss recommendations ✕",
        hypothesis: "Hypothesis:",
        confidence: "Confidence:",
        rec1Title: 'Target high-intent query "Best boutique stays in Da Nang"',
        rec1Hypo: "Potential +1,400 monthly organic visits based on low SERP competition and high commercial intent.",
        rec1Btn: "Explore opportunity",
        rec2Title: "Refresh declining Q2 Vietnam visa guide article",
        rec2Hypo: "Organic impressions dropped -14% following government visa policy update; refreshing content recovers ~620 visits.",
        rec2Btn: "Create task",
        rec3Title: "Auto-generate social snippets for Hoi An guide",
        rec3Hypo: "Estimated 280-350 referral visits across Twitter/X and LinkedIn distribution channels.",
        rec3Btn: "Launch workflow",
      },
    },
    workflows: {
      pageTitle: "AI Growth Operations",
      prototypeBadge: "Prototype data • {workspace} AI Growth OS",
      pageSubtitle: "Monitor autonomous growth workflows, agent execution, and tasks requiring attention.",
      executionHistory: "Execution history",
      filterStages: "Filter stages",
      allStages: "All stages",
      allAgents: "All Agents",
      allStatuses: "All statuses",
      pipelineCardTitle: "Active Autonomous Pipeline Run",
      pipelineSubtitle: "Central Vietnam SEO Opportunity & Content Expansion",
      viewTrace: "View execution trace",
      stageDetails: "Stage Details",
      taskDetails: "Task Details",
      logs: "Execution Logs",
      artifactsCreated: "Artifacts Created",
      inspectReviewQueue: "Inspect in Review Queue",
      close: "Close",
      kpi: {
        activeRuns: "Active Runs",
        completedTasks: "Completed Tasks",
        pendingReview: "Pending Review",
        successRate: "Success Rate",
      },
      table: {
        task: "Task",
        agent: "Agent",
        stage: "Stage",
        priority: "Priority",
        status: "Status",
        duration: "Duration",
        action: "Action",
        viewDetails: "Details",
        searchPlaceholder: "Search tasks by name, agent...",
        statusRunning: "Running",
        statusCompleted: "Completed",
        statusReview: "Needs review",
        statusFailed: "Failed",
        statusInQueue: "In Queue",
      },
      modal: {
        statusAndProgress: "STATUS & PROGRESS",
        description: "DESCRIPTION",
        liveLogs: "LIVE TRACE LOGS",
        close: "Close",
        openReviewQueue: "Inspect in Review Queue",
        inProgress: "In progress",
        completed: "Completed",
        blocked: "Blocked",
      },
    },
    reviewQueue: {
      pageTitle: "Review Queue",
      badge: "Tier-1 Gated",
      subtitle: "Review AI-generated outputs that require your approval before autonomous production execution.",
      pendingCount: "{count} pending",
      approvedToday: "{count} approved today",
      rejectedCount: "{count} rejected",
      tabs: {
        all: "All",
        articles: "Articles",
        social: "Social",
        seo: "SEO",
        landingPages: "Landing Pages",
      },
      detail: {
        pendingApproval: "Pending Approval",
        approved: "Approved",
        rejected: "Rejected",
        targetCluster: "Target Cluster:",
        targetLocale: "Target Locale:",
        viewJson: "View JSON Payload",
        expandDocument: "Expand Full Document",
        section1Title: "Executive Summary & Market Void",
        section2Title: "Priority Topic Clusters & Recommendations",
        humanApprovalNotice: "Human approval is required before next gated action:",
        rejectPlaceholder: "Reason for rejection (optional feedback for agent recalibration)...",
        rejectBtn: "✕ Reject",
        approveBtn: "✓ Approve for Distribution",
        approveSuccess: "Item approved successfully! Queued for autonomous CMS syndication.",
        rejectSuccess: "Item marked as rejected. Agent recalibration trigger sent.",
        jsonPayloadTitle: "JSON Payload",
      },
      items: {
        confidence: "Confidence:",
        estimatedImpact: "Estimated Impact:",
        needsHumanReview: "Needs human review",
      },
    },
    artifacts: {
      pageTitle: "Artifacts & Content Library",
      subtitle: "Browse, edit, export, and manage AI-generated growth deliverables.",
      searchPlaceholder: "Search by title, category, keywords...",
      filterAll: "All",
      filterArticles: "Articles",
      filterReports: "Reports",
      filterSocial: "Social",
      filterSeo: "SEO",
      deliverableDetails: "Deliverable Details",
      editArtifact: "Edit Artifact",
      exportJson: "Export JSON",
      sendToReview: "Send to Review Queue",
      versionHistory: "Version history",
      versionsCount: "versions",
      lastUpdated: "Last updated",
      authorAgent: "Author Agent",
      targetKeyword: "Target Keyword",
      targetAudience: "Target Audience",
      savedToast: "Saved changes! Created new version snapshot.",
      sentToReviewToast: "Artifact sent to Review Queue successfully!",
      exportedToast: "Exported package successfully.",
      modalTitle: "Edit Artifact",
      modalSubtitle: "Update the deliverable content before submitting to the review queue.",
      documentContentLabel: "Document Content",
      titleLabel: "Artifact Title",
      saveChanges: "Save Changes",
      discard: "Discard",
      aiWorkspaceBadge: "AI Workspace",
      filterListPlaceholder: "Filter list...",
      deliverablesTitle: "DELIVERABLES",
      noDeliverablesFound: "No deliverables found.",
      statusComplete: "Complete",
      statusInProgress: "In progress",
      statusValidated: "Validated",
      statusQueued: "Queued",
      selectPrompt: "Select a deliverable on the left to inspect its content.",
      executiveInsight: "Executive Insight:",
      aiPipeline: "AI Pipeline",
      deterministic: "Deterministic",
      pipelineIdLabel: "Pipeline ID:",
      autonomousWorkflow: "AUTONOMOUS EXECUTION WORKFLOW",
      completedByAgent: "Completed by Agent",
      activeOutputNode: "Active Output Node",
      requiresReview: "Requires Review",
      agentLabel: "Agent:",
      viewJson: "View JSON",
      versionControlNotice: "Version control:",
      versionControlDesc: "Saving changes will preserve this draft as a new version snapshot ({version}) without overwriting historical run baselines.",
      sendForReviewBtn: "Send for review",
    },
    distribution: {
      pageTitle: "Distribution Control Center",
      eyebrow: "AI AUTOMATION CONTROL CENTER",
      subtitle: "Autonomous multi-channel syndication, pre-flight gate validation, and endpoint credential sentinel across TripC network.",
      attentionRequired: "Attention Required",
      allOperational: "All systems operational",
      killSwitchEngaged: "Emergency Kill-Switch: Engaged (Paused)",
      killSwitchDisengaged: "Emergency Kill-Switch: Disengaged",
      auditEndpoints: "Audit Endpoints",
      pipelineTitle: "Publishing Pipeline & Task Execution",
      pipelineSubtitle: "Select a pipeline stage to inspect validation gates, agent assignments, and filter associated syndication tasks.",
      activeWorker: "Active Worker:",
      tasksTitle: "Publishing Tasks & Execution Schedule",
      tasksSubtitle: "Monitor publication status, projected dispatch schedules, and execution telemetry.",
      endpointsTitle: "Channel Fleet & Credential Sentinel",
      endpointsSubtitle: "Monitor OAuth token expiration, CMS webhook latencies, and platform-specific API health.",
      reconnect: "Reconnect",
      schedulePost: "+ Schedule Post",
    },
    growthResults: {
      pageTitle: "Growth Results",
      subtitle: "Measure performance, understand impact, and identify the next growth opportunities.",
      period7d: "7D",
      period30d: "30D",
      period90d: "90D",
      refresh: "Refresh",
      exportCsv: "Export CSV",
      northStar: "Incremental Qualified Traffic",
      trafficPerformance: "Traffic Performance",
      trafficSubtitle: "Current cycle vs. prior baseline attribution",
      trafficSources: "Traffic Sources",
      channelPerformance: "Channel Performance",
      conversionFunnel: "Conversion Funnel",
      serpPerformance: "SERP Keyword Rankings",
    },
    workspaceIntegrations: {
      pageTitle: "Workspace & Integrations",
      subtitle: "Manage your core business context, brand voice guidelines, team roles, and external intelligence feeds.",
      eyebrow: "AI GROWTH OS • WORKSPACE INTELLIGENCE",
      exportConfig: "Export Config",
      saveChanges: "Save Changes",
      tabWorkspace: "Workspace Profile & Brand Voice",
      tabIntegrations: "Connected Integrations & Feeds",
      overviewTitle: "Workspace Overview",
      brandVoiceTitle: "Brand Voice & Editorial Guidelines",
      teamTitle: "Team Members & Access Roles",
      goalsTitle: "Growth Goals & North Star Metrics",
    },
  },
};

