import SkyHostedMonthly from '@/components/sky-hosted-monthly';
import SkyFreeCloudPanel from '@/components/sky-free-cloud-panel';
import SkyFreeCloudAccount from '@/components/sky-free-cloud-account';
export default function Page(){return <main style={{maxWidth:900,margin:'40px auto',padding:24}}><SkyFreeCloudPanel/><details style={{marginTop:40}}><summary>Sandbox契約・検証用の操作</summary><SkyHostedMonthly/><SkyFreeCloudAccount/></details></main>;}
