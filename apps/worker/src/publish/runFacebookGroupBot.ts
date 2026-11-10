import '../loadApiEnv';
import fs from 'node:fs';
import { FacebookGroupBot, type DeleteGroupPostOptions, type GroupPostOptions } from './FacebookGroupBot';

function parseArgValue(flag: string): string | undefined {
  const idx = process.argv.indexOf(flag);
  if (idx !== -1 && idx + 1 < process.argv.length) {
    return process.argv[idx + 1];
  }
  return undefined;
}

function emitResult(payload: Record<string, unknown>): void {
  console.log(`GROUP_BOT_RESULT:${JSON.stringify(payload)}`);
}

async function main() {
  const command = process.argv[2] || 'check';
  const groupUrlFlag = parseArgValue('--group-url');
  const payloadFile = parseArgValue('--payload-file');
  const bot = new FacebookGroupBot();

  if (command === 'login') {
    console.log('🚀 KHỞI ĐỘNG TRÌNH DUYỆT ĐĂNG NHẬP QUẢN TRỊ VIÊN FACEBOOK...');
    const result = await bot.loginInteractive(groupUrlFlag);
    console.log(result.message);
    emitResult(result as unknown as Record<string, unknown>);
    process.exit(result.success ? 0 : 1);
  } else if (command === 'check') {
    console.log('🔍 KIỂM TRA PHIÊN ĐĂNG NHẬP FACEBOOK...');
    const session = await bot.checkSession();
    emitResult({
      success: session.isLoggedIn,
      isLoggedIn: session.isLoggedIn,
      detail: session.detail,
      stateFile: bot.getStateFile(),
    });
    if (session.isLoggedIn) {
      console.log('✅ Đã có phiên đăng nhập Quản trị viên Facebook hợp lệ.');
      process.exit(0);
    } else {
      console.log('❌ Chưa có phiên đăng nhập. Hãy chạy lệnh: npm run group-bot:login');
      process.exit(1);
    }
  } else if (command === 'post') {
    let options: GroupPostOptions;
    if (payloadFile) {
      const raw = fs.readFileSync(payloadFile, 'utf8');
      options = JSON.parse(raw) as GroupPostOptions;
      if (!options.groupUrl && groupUrlFlag) {
        options.groupUrl = groupUrlFlag;
      }
      if (options.headless === undefined) {
        options.headless = true;
      }
    } else {
      const positionalArgs = process.argv.slice(3).filter((arg, i, arr) => {
        if (arg.startsWith('--')) return false;
        if (i > 0 && arr[i - 1]?.startsWith('--')) return false;
        return true;
      });
      options = {
        groupUrl: groupUrlFlag,
        title: positionalArgs[0] || 'Cẩm nang du lịch và ẩm thực Đà Nẵng',
        body:
          positionalArgs[1] ||
          'Khám phá mì Quảng chuẩn vị 1A Hải Phòng, bún chả cá bà Lữ đường Hùng Vương và bánh tráng cuốn thịt heo Đại Lộc.',
        discussionPrompt:
          positionalArgs[2] ||
          'Bạn thích nhất món ăn nào tại Đà Nẵng và có quán ruột nào muốn giới thiệu cùng cộng đồng không?',
        headless: false,
      };
    }

    console.log(`📝 ĐANG ĐĂNG BÀI VÀO GROUP: "${options.title}"...`);
    const result = await bot.postToGroup(options);
    console.log('🎉 KẾT QUẢ:', result);
    emitResult(result as unknown as Record<string, unknown>);
    process.exit(result.success ? 0 : 1);
  } else if (command === 'delete') {
    const postUrlFlag = parseArgValue('--post-url');
    const titleFlag = parseArgValue('--title');
    let delOptions: DeleteGroupPostOptions = {
      groupUrl: groupUrlFlag,
      postUrl: postUrlFlag,
      titleSnippet: titleFlag,
      headless: true,
    };
    if (payloadFile) {
      const raw = fs.readFileSync(payloadFile, 'utf8');
      delOptions = { ...delOptions, ...(JSON.parse(raw) as DeleteGroupPostOptions) };
    }
    console.log(`🗑️ ĐANG THU HỒI BÀI ĐĂNG TRÊN GROUP: ${delOptions.postUrl || delOptions.titleSnippet || delOptions.groupUrl}...`);
    const result = await bot.deleteGroupPost(delOptions);
    console.log('🎉 KẾT QUẢ THU HỒI:', result);
    emitResult(result as unknown as Record<string, unknown>);
    process.exit(result.success ? 0 : 1);
  } else {
    const msg = `Lệnh không hợp lệ: "${command}". Các lệnh hỗ trợ: login, check, post, delete`;
    console.log(msg);
    emitResult({ success: false, errorCode: 'INVALID_COMMAND', message: msg });
    process.exit(1);
  }
}

main().catch((err) => {
  const message = err instanceof Error ? err.message : String(err);
  const errorCode = message.startsWith('FACEBOOK_GROUP_SESSION_MISSING')
    ? 'FACEBOOK_GROUP_SESSION_MISSING'
    : 'FACEBOOK_GROUP_PUBLISH_FAILED';
  console.error('❌ Lỗi:', message);
  emitResult({ success: false, errorCode, message });
  process.exit(1);
});
