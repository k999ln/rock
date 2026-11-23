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
export const PROFILE_CONSENT_VERSION = '2026-11-22.1';
export const PROFILE_CONSENT_TEXT = '入力した情報を暗号化して保存し、次の登録でも必要な項目だけ再利用します。提出先への送信は毎回確認します。';
export type ProfileConsent = { version: string; at: number; action: 'save' | 'reuse-stop' | 'reuse-resume'; fields: ProfileField[]; documents: string[] };
export type NoahProfile = { revision: number; fields: Partial<Record<ProfileField, string>>; documents: NoahIdentityDocument[]; grants: NoahDelegation[]; paused: boolean; reuseEnabled: boolean; consents: ProfileConsent[] };
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

