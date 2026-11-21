export const NOAH_PROFILE_FIELDS = {
  name: { label: '氏名', group: '基本情報', max: 120, autocomplete: 'name' },
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
export type NoahProfile = { revision: number; fields: Partial<Record<ProfileField, string>>; documents: NoahIdentityDocument[]; grants: NoahDelegation[]; paused: boolean };
export type NoahProfileView = NoahProfile & { ownerScope: string; available: boolean };
export const emptyNoahProfile = (): NoahProfile => ({ revision: 0, fields: {}, documents: [], grants: [], paused: false });
export const PROFILE_MAX_DOCUMENT = 5 * 1024 * 1024;
export const profileField = (value: unknown): value is ProfileField => typeof value === 'string' && Object.hasOwn(NOAH_PROFILE_FIELDS, value);
