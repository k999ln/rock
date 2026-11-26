export const NOAH_PROFILE_FIELDS = {
  name: { label: '氏名', group: '基本情報', max: 120, autocomplete: 'name' },
  nameKana: { label: 'フリガナ', group: '基本情報', max: 120, autocomplete: 'off' },
  displayName: { label: '表示名', group: '基本情報', max: 80, autocomplete: 'nickname' },
  email: { label: 'メール', group: '基本情報', max: 320, autocomplete: 'email' },
  phone: { label: '電話番号', group: '基本情報', max: 40, autocomplete: 'tel' },
  address: { label: '住所', group: '基本情報', max: 500, autocomplete: 'street-address' },
  birthDate: { label: '生年月日', group: '基本情報', max: 10, autocomplete: 'bday' },
  businessName: { label: '屋号', group: '活動プロフィール', max: 160, autocomplete: 'organization' },
  bio: { label: '紹介文', group: '活動プロフィール', max: 2000, autocomplete: 'off' },
  skills: { label: 'スキル・実績', group: '活動プロフィール', max: 2000, autocomplete: 'off' },
  bankName: { label: '銀行名', group: '受取口座', max: 120, autocomplete: 'off' },
  bankBranch: { label: '支店名・支店番号', group: '受取口座', max: 120, autocomplete: 'off' },
  bankType: { label: '口座種別', group: '受取口座', max: 20, autocomplete: 'off' },
  bankNumber: { label: '口座番号', group: '受取口座', max: 20, autocomplete: 'off' },
  bankHolder: { label: '口座名義', group: '受取口座', max: 160, autocomplete: 'off' },
  identityExpiry: { label: '書類の有効期限', group: '本人確認', max: 10, autocomplete: 'off' },
} as const;
export type ProfileField = keyof typeof NOAH_PROFILE_FIELDS;
export type DelegationMode = 'allow' | 'confirm' | 'deny';
export type NoahDelegation = { target: string; name: string; action: string; label: string; digest: string; mode: DelegationMode };
export type NoahIdentityDocument = { id: string; name: string; type: string; bytes: number; uploadedAt: number };
export const PROFILE_CONSENT_VERSION = '2026-11-26.1';
export const PROFILE_CONSENT_TEXT = '確認した登録情報をNoahに暗号化して保存し、eSIMの申込みや、自分で選ぶAgentの追加・外部サービスへの登録で、必要な項目だけ再利用することに同意します。送信先・目的・項目は送信前に毎回確認します。再利用は任意で、いつでも停止できます。';
export const PROFILE_CONSENT_DETAILS = [
  { title: '保存する情報', text: '自分で確認して保存した氏名・メール・電話番号・住所などの登録情報です。契約や登録に必要な情報は提供元によって異なります。不要な項目を埋める必要はありません。' },
  { title: 'Apple・Googleの情報', text: '対応するログイン連携で提供を許可した氏名・メールなどは、確認して保存した場合に再利用できます。住所・電話番号・本人確認書類が自動で取得できるとは限りません。氏名やメールだけで回線契約の本人確認が完了するわけではありません。' },
  { title: 'Agentを追加するとき', text: '保存済みの情報から必要な項目を使い、再入力を減らします。外部へ送る前に、登録先・登録を代行する提供元・目的・送信項目・適用される規約を確認できます。未対応のサービスでは、そのサービスでの登録やログインが必要です。' },
  { title: '別の確認が必要な情報', text: 'Apple・Googleのパスワード、認証トークン、SIMの秘密鍵は、登録情報として他のAgentへ渡しません。支払情報・口座・本人確認書類も一括では共有しません。必要な場合は対象サービスと項目を確認します。追加の権限許可、本人確認、規約への同意や支払いは省略しません。' },
  { title: '停止・削除', text: '再利用への同意は回線契約への同意とは別です。同意しなくても、必要な項目をその都度入力して手続きを進められます。「登録情報」から再利用を停止し、保存した項目や書類を削除できます。送信済みの情報の削除・退会は、送信先の手続きに従います。' },
] as const;
export type ProfileConsent = { version: string; at: number; action: 'save' | 'reuse-stop' | 'reuse-resume'; fields: ProfileField[]; documents: string[] };
export type NoahProfile = { revision: number; fields: Partial<Record<ProfileField, string>>; documents: NoahIdentityDocument[]; grants: NoahDelegation[]; paused: boolean; reuseEnabled: boolean; consents: ProfileConsent[] };
/** Reuse is available only after an explicit receipt for the current explanation version. */
export const hasCurrentProfileConsent = (profile: Pick<NoahProfile, 'consents'>): boolean =>
  profile.consents.some(consent => consent.version === PROFILE_CONSENT_VERSION && consent.action !== 'reuse-stop');
export type NoahProfileView = NoahProfile & { ownerScope: string; available: boolean; browserOwned?: boolean };
export const emptyNoahProfile = (): NoahProfile => ({ revision: 0, fields: {}, documents: [], grants: [], paused: false, reuseEnabled: false, consents: [] });
export const PROFILE_MAX_DOCUMENT = 5 * 1024 * 1024;
export const profileField = (value: unknown): value is ProfileField => typeof value === 'string' && Object.hasOwn(NOAH_PROFILE_FIELDS, value);
/**
 * サインインした本人だけが保存できる群（決め: 2026-11-23、本人「好きにしていいよ」。使い勝手の確かめ 9 章の Q3・抜け道 S9）。
 * ブラウザだけの本人（Cookie の保存先）は、同じ端末を使う人が開けるので、お金の受取口座と本人確認の書類を新しく置かせない。
 * 既に置いた物は、読む・消す事だけできる。
 */
export const NOAH_PROFILE_SIGNED_IN_GROUPS: readonly string[] = ['受取口座', '本人確認'];
export const NOAH_PROFILE_SIGNED_IN_ONLY = 'お金の受取口座と本人確認の書類は、サインインした本人だけが保存できます。このブラウザだけの保存先は、同じ端末を使う人が開けるためです。';
export const profileFieldSignedInOnly = (field: ProfileField): boolean => NOAH_PROFILE_SIGNED_IN_GROUPS.includes(NOAH_PROFILE_FIELDS[field].group);

