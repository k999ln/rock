'use client';
import { useNoahLocale } from './noah-locale';
import NoahPageTabs from './noah-page-tabs';
import { NoahBoardsPage, NoahBoardPage } from './noah-boards';
import NoahLibrary from './noah-library';
import SkyAgentLibrary from './sky-agent-library';
import NoahResultData from './noah-result-data';
import NoahWorkPage from './noah-work-page';
import SkyOutputCenter from './sky-output-center';
import { NOAH_SAVED_TABS, noahPageTab, type NoahPageParams } from '@/lib/noah-page-routes';
import styles from './noah-page-tabs.module.css';
export default function NoahSaved({params}:{params:NoahPageParams}) {
  const {t}=useNoahLocale();
  const tab=noahPageTab(params.tab,NOAH_SAVED_TABS,'boards');
  const board=typeof params.board==='string'?params.board.slice(0,160):'';
  const job=typeof params.job==='string'?params.job.slice(0,160):undefined;
  return <div className={styles.page}><h1 className={styles.heading}>{t('保存したもの')}</h1>
    <NoahPageTabs page="saved" active={tab} items={[["boards","ボード"],["agents","Agent"],["roles","担当"],["results","成果"],["files","ファイル"]]}/>
    {tab==='boards'?(board?<NoahBoardPage key={board} id={board}/>:<NoahBoardsPage embedded/>):tab==='agents'?<NoahLibrary embedded/>:tab==='roles'?<SkyAgentLibrary embedded/>:tab==='results'?<NoahWorkPage results embedded legacyResults={<NoahResultData embedded/>}/>:<SkyOutputCenter initialWorkJobId={job}/>}
  </div>;
}
