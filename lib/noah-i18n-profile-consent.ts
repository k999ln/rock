import { PROFILE_CONSENT_TEXT, PROFILE_CONSENT_DETAILS } from './noah-profile-contract.ts';

/** Same registration reuse explanation in all supported locales: en, zh-CN, ko, es, ar. */
export const NOAH_PROFILE_CONSENT_MESSAGES: Record<string, readonly [string, string, string, string, string]> = {
  'eSIM・Agent登録での情報の再利用について': ['Reusing details for eSIM and Agent registration', '在 eSIM 和 Agent 注册中复用信息', 'eSIM 및 Agent 등록 정보 재사용 안내', 'Reutilizar datos para registrar eSIM y Agentes', 'إعادة استخدام البيانات لتسجيل eSIM والوكلاء'],
  '保存・再利用の同意内容を読む': ['Read the storage and reuse consent', '阅读保存和复用同意内容', '저장 및 재사용 동의 내용 읽기', 'Leer el consentimiento de almacenamiento y reutilización', 'قراءة الموافقة على الحفظ وإعادة الاستخدام'],
  [PROFILE_CONSENT_TEXT]: [
    'I agree to store the registration details I have reviewed, encrypted in Noah, and reuse only the necessary fields when applying for an eSIM, adding Agents I choose, or registering with external services. I will review the recipient, purpose and fields before each submission. Reuse is optional and can be stopped at any time.',
    '我同意将已确认的注册信息加密保存到 Noah，并在申请 eSIM、添加自己选择的 Agent 或注册外部服务时，仅复用必要字段。每次发送前都会确认接收方、用途和字段。复用为自愿选择，可随时停止。',
    '확인한 등록 정보를 Noah에 암호화하여 저장하고, eSIM 신청이나 직접 선택한 Agent 추가 및 외부 서비스 등록에 필요한 항목만 재사용하는 데 동의합니다. 전송할 때마다 수신처, 목적, 항목을 확인합니다. 재사용은 선택 사항이며 언제든 중지할 수 있습니다.',
    'Acepto guardar cifrados en Noah los datos de registro que he revisado y reutilizar solo los campos necesarios al solicitar una eSIM, añadir Agentes que elija o registrarme en servicios externos. Revisaré el destinatario, el propósito y los campos antes de cada envío. La reutilización es opcional y puedo detenerla en cualquier momento.',
    'أوافق على حفظ بيانات التسجيل التي راجعتها مشفّرة في Noah، وإعادة استخدام الحقول اللازمة فقط عند طلب eSIM أو إضافة وكلاء أختارهم أو التسجيل في خدمات خارجية. سأراجع الجهة المستلمة والغرض والحقول قبل كل إرسال. إعادة الاستخدام اختيارية ويمكن إيقافها في أي وقت.',
  ],
  '保存する情報': ['Details to store', '保存的信息', '저장할 정보', 'Datos que se guardan', 'البيانات التي تُحفظ'],
  'Apple・Googleの情報': ['Apple and Google details', 'Apple 和 Google 的信息', 'Apple 및 Google 정보', 'Datos de Apple y Google', 'بيانات Apple وGoogle'],
  'Agentを追加するとき': ['When adding an Agent', '添加 Agent 时', 'Agent를 추가할 때', 'Al añadir un Agente', 'عند إضافة وكيل'],
  '別の確認が必要な情報': ['Details requiring separate confirmation', '需要另行确认的信息', '별도 확인이 필요한 정보', 'Datos que requieren confirmación aparte', 'بيانات تتطلب تأكيدًا منفصلًا'],
  '停止・削除': ['Stopping reuse and deleting details', '停止和删除', '중지 및 삭제', 'Detener y eliminar', 'الإيقاف والحذف'],
  [PROFILE_CONSENT_DETAILS[0].text]: [
    'These are registration details you have reviewed and saved, such as your name, email, phone number and address. Required details depend on the provider. You do not need to fill in unnecessary fields.',
    '仅包括您确认并保存的姓名、邮箱、电话号码、地址等注册信息。签约或注册所需的信息因提供方而异，无需填写不必要的字段。',
    '직접 확인하고 저장한 이름, 이메일, 전화번호, 주소 등의 등록 정보입니다. 계약이나 등록에 필요한 정보는 제공업체마다 다릅니다. 불필요한 항목은 입력하지 않아도 됩니다.',
    'Son los datos de registro que has revisado y guardado, como nombre, correo, teléfono y dirección. Los requisitos dependen del proveedor. No necesitas rellenar campos innecesarios.',
    'هي بيانات التسجيل التي راجعتها وحفظتها، مثل الاسم والبريد الإلكتروني ورقم الهاتف والعنوان. تختلف البيانات المطلوبة حسب المزوّد. لا يلزم ملء الحقول غير الضرورية.',
  ],
  [PROFILE_CONSENT_DETAILS[1].text]: [
    'Names, email addresses and other details shared with your permission through a supported sign-in connection can be reused after you review and save them. Addresses, phone numbers and identity documents may not be available automatically. A name and email alone do not complete identity checks for a mobile contract.',
    '通过受支持的登录连接，经您允许提供的姓名、邮箱等信息，可在确认并保存后复用。地址、电话号码和身份证明文件不一定能自动获取。仅有姓名和邮箱并不代表已完成通信合约的身份核验。',
    '지원되는 로그인 연동에서 제공을 허용한 이름과 이메일 등은 확인하고 저장한 후 재사용할 수 있습니다. 주소, 전화번호, 신분증은 자동으로 가져오지 못할 수 있습니다. 이름과 이메일만으로 회선 계약의 본인 확인이 완료되지는 않습니다.',
    'Los nombres, correos y otros datos que autorices compartir mediante un inicio de sesión compatible se pueden reutilizar tras revisarlos y guardarlos. La dirección, el teléfono y los documentos de identidad podrían no obtenerse automáticamente. El nombre y el correo no completan por sí solos la verificación de identidad de un contrato móvil.',
    'يمكن إعادة استخدام الاسم والبريد وغيرهما من البيانات التي تسمح بمشاركتها عبر تسجيل دخول مدعوم بعد مراجعتها وحفظها. قد لا يتوفر العنوان أو الهاتف أو مستند الهوية تلقائيًا. الاسم والبريد وحدهما لا يُكملان التحقق من الهوية لعقد اتصال.',
  ],
  [PROFILE_CONSENT_DETAILS[2].text]: [
    'Necessary fields are reused from saved details to reduce retyping. Before external submission, you can review the registration service, the provider submitting on your behalf, the purpose, fields and applicable terms. Unsupported services require registration or sign-in directly with that service.',
    '从已保存的信息中复用必要字段，减少重复输入。向外部发送前，可确认注册服务、代办提供方、用途、发送字段和适用条款。未支持的服务仍需在该服务中注册或登录。',
    '저장된 정보에서 필요한 항목을 사용해 재입력을 줄입니다. 외부 전송 전에 등록할 서비스, 등록 대행업체, 목적, 전송 항목, 적용 약관을 확인할 수 있습니다. 미지원 서비스는 해당 서비스에서 등록하거나 로그인해야 합니다.',
    'Se reutilizan los campos necesarios para evitar volver a escribirlos. Antes del envío externo puedes revisar el servicio, el proveedor que tramita el registro, el propósito, los campos y las condiciones aplicables. Los servicios no compatibles requieren registrarse o iniciar sesión directamente.',
    'تُعاد الاستفادة من الحقول اللازمة لتقليل إعادة الإدخال. قبل الإرسال الخارجي يمكنك مراجعة خدمة التسجيل والمزوّد الذي يسجل نيابة عنك والغرض والحقول والشروط. تتطلب الخدمات غير المدعومة التسجيل أو الدخول لديها مباشرة.',
  ],
  [PROFILE_CONSENT_DETAILS[3].text]: [
    'Apple and Google passwords, authentication tokens and SIM private keys are not passed to other Agents as registration details. Payment details, bank accounts and identity documents are not shared together automatically. When needed, you review the service and fields. Additional permissions, identity checks, terms acceptance and payment approval still apply.',
    'Apple 和 Google 密码、认证令牌、SIM 私钥不会作为注册信息传给其他 Agent。支付信息、银行账户和身份证明文件也不会批量共享。确有需要时会确认服务及字段。额外授权、身份核验、条款同意和付款批准仍需完成。',
    'Apple 및 Google 비밀번호, 인증 토큰, SIM 비밀키는 등록 정보로 다른 Agent에 전달하지 않습니다. 결제 정보, 은행 계좌, 신분증도 일괄 공유하지 않습니다. 필요한 경우 서비스와 항목을 확인합니다. 추가 권한, 본인 확인, 약관 동의 및 결제 승인은 생략하지 않습니다.',
    'Las contraseñas de Apple y Google, los tokens de autenticación y las claves privadas de la SIM no se pasan a otros Agentes como datos de registro. Tampoco se comparten en bloque datos de pago, cuentas bancarias ni documentos de identidad. Cuando sean necesarios, revisarás el servicio y los campos. Se mantienen los permisos adicionales, la verificación de identidad, la aceptación de condiciones y la aprobación del pago.',
    'لا تُمرّر كلمات مرور Apple وGoogle أو رموز المصادقة أو مفاتيح SIM الخاصة إلى وكلاء آخرين كبيانات تسجيل. ولا تُشارك بيانات الدفع والحسابات البنكية ومستندات الهوية دفعة واحدة. عند الحاجة تراجع الخدمة والحقول. تبقى الأذونات الإضافية والتحقق من الهوية والموافقة على الشروط والدفع مطلوبة.',
  ],
  [PROFILE_CONSENT_DETAILS[4].text]: [
    'Consent to reuse is separate from consent to the mobile contract. Without it, you can enter the necessary details for each procedure. In Saved information, you can stop reuse and delete stored fields or documents. Deleting information already submitted or closing an external account follows the recipient’s procedures.',
    '复用同意与通信合约同意相互独立。不同意复用也可每次手动输入必要信息。在“注册信息”中可停止复用并删除保存的字段或文件。已发送信息的删除或外部账户注销，需按接收方流程办理。',
    '재사용 동의는 회선 계약 동의와 별개입니다. 동의하지 않아도 절차마다 필요한 정보를 입력할 수 있습니다. 등록 정보에서 재사용을 중지하고 저장한 항목이나 서류를 삭제할 수 있습니다. 이미 전송된 정보의 삭제나 외부 계정 탈퇴는 수신처의 절차를 따릅니다.',
    'El consentimiento para reutilizar es independiente del contrato móvil. Sin él, puedes introducir los datos necesarios en cada trámite. En Datos guardados puedes detener la reutilización y eliminar campos o documentos. Para borrar datos ya enviados o cerrar una cuenta externa, sigue el procedimiento del destinatario.',
    'الموافقة على إعادة الاستخدام مستقلة عن الموافقة على عقد الاتصال. يمكنك دونها إدخال البيانات المطلوبة في كل إجراء. يمكنك إيقاف إعادة الاستخدام وحذف الحقول أو المستندات من البيانات المحفوظة. حذف البيانات المرسلة سابقًا أو إغلاق حساب خارجي يتبع إجراءات الجهة المستلمة.',
  ],
};
