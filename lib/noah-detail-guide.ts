import type { NoahLocale } from './noah-i18n.ts';

/** Editorial examples of documented provider behavior. This guide grants no execution rights. */
export type NoahDetailGuide = {
  name: string;
  headline: string;
  summary: string;
  priceLabel: string;
  examples: readonly { title: string; input: string; output: string }[];
  requirements: readonly { label: string; text: string }[];
  sources: readonly { label: string; href: string }[];
};

const callGuide = 'https://callmcp.ai/mcp-server-for-phone-calls';
const toolsGuide = 'https://www.kaicalls.com/docs/api/connectors';
const pricing = 'https://callmcp.ai/pricing';

const callMcp: Record<NoahLocale, Omit<NoahDetailGuide, 'name'>> = {
  ja: {
    headline: '電話で予約を確かめ、返事を読み返す',
    summary: '予約や問い合わせを電話で受けるお店やチーム向けです。KaiCallsの業務用番号でAgentが電話をかけたり受けたりし、通話の要約や、記録された会話を後から確認できます。',
    priceLabel: '実際の通話は有料',
    examples: [
      { title: '来店予約を電話で確認する', input: '明日15時の予約でよいか、予約したお客様に電話で確認して。', output: '文字起こしが残れば「16時なら伺えます」といった返事を読み返せます。不在の場合は通話IDで「応答なし」を確認できます。' },
      { title: '前の電話の用件を調べる', input: '昨日、見積もりの件で電話をくれた方は、いつ折り返してほしいと言っていた？', output: '履歴から該当する通話の要約を探します。文字起こしがあれば、「金曜の午後に」という相手の言葉まで読み返せます。' },
    ],
    requirements: [
      { label: 'アカウントと権限', text: 'KaiCallsのアカウントを用意し、使う操作を許可します。通話履歴の閲覧と、実際に電話をかける権限は別々です。' },
      { label: '送信先', text: '発信時には相手の電話番号と伝える用件がcallmcp.aiを通じてKaiCallsに送られます。発信前に番号と用件を確かめてください。' },
      { label: 'ほかの連絡手段', text: 'SMSは受信履歴を確認でき、送信には回線の承認が必要です。WhatsAppは接続済みの番号で受信後24時間以内に返信できます。メール配信は送信元を設定し、内容を承認してから行います。' },
      { label: '提供元の料金', text: '初めての方は、KaiCallsの無料プレビューで電話の応答をブラウザーから試せます。実際の発着信には、提供元の有料プランと利用可能な電話番号が必要です。' },
    ],
    sources: [{ label: '通話の流れと結果の読み方', href: callGuide }, { label: '対応する操作と権限', href: toolsGuide }, { label: '提供元の料金表', href: pricing }],
  },
  en: {
    headline: 'Confirm appointments by phone and read the replies',
    summary: 'For teams that handle bookings and enquiries by phone. Your agent can make and receive calls on a KaiCalls business line. You can later review the summary and any captured transcript.',
    priceLabel: 'Live calls require a paid plan',
    examples: [
      { title: 'Confirm a booking', input: 'Call the customer and check whether tomorrow at 3 pm still works for them.', output: 'If a transcript was captured, you might read “I can come at four.” If the customer did not pick up, use the call ID to see the no-answer status.' },
      { title: 'Look up a previous call', input: 'When did the person who rang about a quote yesterday ask us to call back?', output: 'Find the matching call summary. If a transcript is available, you can read the caller’s exact words, such as “Friday afternoon.”' },
    ],
    requirements: [
      { label: 'Account and permissions', text: 'Connect a KaiCalls account and authorize the tools you need. Reading call records and placing calls require separate permissions.' },
      { label: 'Data destination', text: 'CallMCP sends the recipient’s number and the purpose of the call to KaiCalls through callmcp.ai. Check both before dialing.' },
      { label: 'Other channels', text: 'Review incoming texts; sending SMS requires carrier approval. A connected WhatsApp number can reply within 24 hours of a customer’s message. Email campaigns require a configured sender and approval.' },
      { label: 'Provider pricing', text: 'Try the agent’s response first in KaiCalls’ free browser preview. Live inbound and outbound calls require a paid provider plan and an active phone number.' },
    ],
    sources: [{ label: 'Call flow and results', href: callGuide }, { label: 'Tools and permissions', href: toolsGuide }, { label: 'Provider pricing', href: pricing }],
  },
  'zh-CN': {
    headline: '致电确认预约，事后查看答复',
    summary: '适合通过电话处理预约和咨询的商家与团队。Agent 可以使用 KaiCalls 的业务号码拨打和接听电话。通话结束后，可以查看摘要和已保存的通话文字记录。',
    priceLabel: '实际通话需要付费套餐',
    examples: [
      { title: '确认到店时间', input: '给预约的顾客打个电话，确认明天下午三点是否合适。', output: '如果保存了文字记录，便可查看对方的答复，例如“我四点能到”。如果对方未接，可用通话 ID 查看无人接听状态。' },
      { title: '查询之前的来电', input: '昨天打电话询价的人希望我们什么时候回电？', output: '从通话记录中找到对应的摘要。如果有文字记录，还可以查看对方说的原话，例如“周五下午”。' },
    ],
    requirements: [
      { label: '账户和权限', text: '连接 KaiCalls 账户并授权所需的操作。查看通话记录和拨打电话各自需要相应的权限。' },
      { label: '数据去向', text: '拨号时，对方的号码和通话事由会通过 callmcp.ai 发送至 KaiCalls。拨打前请核对两者。' },
      { label: '其他联系方式', text: '可查看收到的短信，发送短信需要运营商批准。已连接的 WhatsApp 号码可在收到客户消息后的24小时内回复。邮件群发需配置发件人并审核批准。' },
      { label: '服务商收费', text: '你可以先用 KaiCalls 的免费浏览器预览试试电话应答。实际拨打和接听电话需要服务商的付费套餐和可用号码。' },
    ],
    sources: [{ label: '通话流程和结果', href: callGuide }, { label: '操作和权限', href: toolsGuide }, { label: '服务商价格', href: pricing }],
  },
  ko: {
    headline: '전화로 예약을 확인하고 답변을 다시 읽기',
    summary: '전화로 예약과 문의를 받는 매장이나 팀을 위한 도구입니다. Agent가 KaiCalls 업무용 번호로 전화를 걸거나 받을 수 있습니다. 통화 후에는 요약과 저장된 대화 기록을 확인할 수 있습니다.',
    priceLabel: '실제 통화에는 유료 요금제가 필요합니다',
    examples: [
      { title: '방문 예약 확인하기', input: '예약한 고객에게 전화해서 내일 오후 3시에 올 수 있는지 확인해 줘.', output: '대화 기록이 남아 있다면 “4시에는 갈 수 있어요” 같은 답을 다시 읽을 수 있습니다. 전화를 받지 않았다면 통화 ID로 무응답 상태를 확인합니다.' },
      { title: '이전 통화 내용 찾기', input: '어제 견적 문의를 한 분이 언제 다시 전화해 달라고 했지?', output: '해당 통화 요약을 찾습니다. 대화 기록이 있으면 “금요일 오후요” 같은 상대방의 말도 다시 읽을 수 있습니다.' },
    ],
    requirements: [
      { label: '계정 및 권한', text: 'KaiCalls 계정을 연결하고 필요한 작업을 허용하세요. 통화 기록 열람과 발신에는 각각 별도의 권한이 필요합니다.' },
      { label: '전송되는 정보', text: '발신할 때 수신 번호와 통화 용건이 callmcp.ai를 통해 KaiCalls로 전송됩니다. 전화를 걸기 전에 두 가지를 확인하세요.' },
      { label: '다른 연락 수단', text: '받은 문자 기록을 볼 수 있으며 SMS 발송에는 통신사 승인이 필요합니다. 연결한 WhatsApp 번호로 고객 메시지 수신 후 24시간 이내에 답장할 수 있습니다. 이메일 캠페인은 발신자 설정과 승인이 필요합니다.' },
      { label: '제공업체 요금', text: '먼저 KaiCalls의 무료 브라우저 미리보기에서 전화 응답을 체험할 수 있습니다. 실제 수신 및 발신에는 제공업체의 유료 요금제와 사용 가능한 전화번호가 필요합니다.' },
    ],
    sources: [{ label: '통화 진행 과정과 결과', href: callGuide }, { label: '도구 및 권한', href: toolsGuide }, { label: '제공업체 요금표', href: pricing }],
  },
  es: {
    headline: 'Confirma citas por teléfono y consulta las respuestas',
    summary: 'Para equipos que atienden reservas y consultas por teléfono. El agente puede hacer y recibir llamadas con el número de empresa de KaiCalls. Después puedes revisar el resumen y la transcripción, si se ha guardado.',
    priceLabel: 'Las llamadas requieren un plan de pago',
    examples: [
      { title: 'Confirmar una reserva', input: 'Llama al cliente para confirmar si mañana a las tres le sigue viniendo bien.', output: 'Si hay transcripción, puedes leer una respuesta como «Puedo ir a las cuatro». Si no contesta, consulta el estado de llamada sin respuesta con su identificador.' },
      { title: 'Consultar una llamada anterior', input: '¿Cuándo pidió que le devolviéramos la llamada la persona que ayer solicitó un presupuesto?', output: 'Localiza el resumen de esa llamada. Si hay transcripción, puedes leer la respuesta exacta, por ejemplo «el viernes por la tarde».' },
    ],
    requirements: [
      { label: 'Cuenta y permisos', text: 'Conecta una cuenta de KaiCalls y autoriza las operaciones que necesites. Consultar el historial y hacer llamadas requieren permisos distintos.' },
      { label: 'Destino de los datos', text: 'Al llamar, el número de destino y el motivo de la llamada se envían a KaiCalls a través de callmcp.ai. Revisa ambos antes de marcar.' },
      { label: 'Otros canales', text: 'Puedes leer los SMS recibidos. Para enviarlos se necesita la aprobación del operador. Un número vinculado a WhatsApp puede responder en las 24 horas siguientes al mensaje del cliente. Las campañas de correo requieren un remitente configurado y aprobación.' },
      { label: 'Precio del proveedor', text: 'Prueba primero cómo responde el agente en la vista previa gratuita de KaiCalls en el navegador. Para hacer y recibir llamadas reales se necesita un plan de pago y un número activo.' },
    ],
    sources: [{ label: 'Proceso y resultado de una llamada', href: callGuide }, { label: 'Herramientas y permisos', href: toolsGuide }, { label: 'Precios del proveedor', href: pricing }],
  },
  ar: {
    headline: 'أكّد المواعيد هاتفيًا وراجع الردود',
    summary: 'للفرق التي تتلقى الحجوزات والاستفسارات عبر الهاتف. يستطيع الوكيل إجراء المكالمات وتلقيها من رقم العمل لدى KaiCalls. ويمكنك لاحقًا مراجعة ملخص المكالمة ونصها إذا حُفظ.',
    priceLabel: 'المكالمات الفعلية تتطلب خطة مدفوعة',
    examples: [
      { title: 'تأكيد موعد زيارة', input: 'اتصل بالعميل واسأله إن كانت الساعة الثالثة بعد ظهر الغد ما زالت تناسبه.', output: 'إذا حُفظ نص المكالمة، يمكنك قراءة رد مثل «يمكنني الحضور في الرابعة». إذا لم يُجب العميل، يمكنك التحقق من حالة عدم الرد باستخدام معرّف المكالمة.' },
      { title: 'مراجعة مكالمة سابقة', input: 'متى طلب الشخص الذي اتصل أمس للاستفسار عن عرض سعر أن نعاود الاتصال به؟', output: 'ابحث عن ملخص المكالمة المطابقة. إذا توفّر نص المكالمة، يمكنك قراءة عبارة المتصل بدقة مثل «بعد ظهر الجمعة».' },
    ],
    requirements: [
      { label: 'الحساب والأذونات', text: 'اربط حساب KaiCalls وامنح الأذونات للعمليات التي تحتاج إليها. تتطلب قراءة سجل المكالمات وإجراء المكالمات إذنين منفصلين.' },
      { label: 'وجهة البيانات', text: 'عند الاتصال يُرسل رقم المستلم والغرض من المكالمة إلى KaiCalls عبر callmcp.ai. تحقق منهما قبل الاتصال.' },
      { label: 'قنوات أخرى', text: 'يمكنك مراجعة الرسائل النصية الواردة، ويتطلب إرسالها موافقة شركة الاتصالات. يمكن لرقم واتساب المرتبط الرد خلال 24 ساعة من رسالة العميل. تتطلب حملات البريد الإلكتروني إعداد المرسل والموافقة على الحملة.' },
      { label: 'أسعار المزوّد', text: 'يمكنك أولًا تجربة ردّ الوكيل في معاينة KaiCalls المجانية عبر المتصفح. يتطلب إجراء المكالمات الفعلية واستقبالها خطة مدفوعة لدى المزوّد ورقم هاتف نشطًا.' },
    ],
    sources: [{ label: 'مراحل المكالمة ونتائجها', href: callGuide }, { label: 'الأدوات والأذونات', href: toolsGuide }, { label: 'أسعار المزوّد', href: pricing }],
  },
};

// Match the verified registry identity, never provider-controlled titles, tags or descriptions.
export function noahDetailGuide(id: string, locale: NoahLocale = 'ja'): NoahDetailGuide | null {
  return id === 'mcp-registry:ai.callmcp/server' ? { name: 'CallMCP', ...callMcp[locale] } : null;
}
