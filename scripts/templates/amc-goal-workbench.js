const wbSources = JSON.parse(
  document.getElementById('goal-sources').textContent,
);
const wbEl = (id) => document.getElementById(id);
const wbEscape = (value) =>
  String(value ?? '').replace(
    /[&<>"']/g,
    (c) =>
      ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[
        c
      ],
  );
const wbList = (items) =>
  '<ul>' +
  items.map((item) => '<li>' + wbEscape(item) + '</li>').join('') +
  '</ul>';
const wbLines = (id) =>
  wbEl(id)
    .value.split('\n')
    .map((value) => value.trim())
    .filter(Boolean);
const wbStorageKey = 'amc-goal-workbench-v1';
let wbGoal = null;
let wbSelectedTask = '';
let wbStoredRaw = null;
let wbUnreadableRaw = null;
let wbView = 'request';
let wbNextAction = null;
const wbChatStorageKey = 'amc-goal-chat-v1';
let wbChat = null;
let wbChatStoredRaw = null;
let wbChatUnreadable = false;
let wbChatComposing = false;
let wbSimpleMode = null;
let wbSimpleRequest = '';
let wbSimpleComposing = false;
let wbSurface = 'board';
const wbNames = {
  draft: '計画案・レビュー待ち',
  active: '計画承認済み',
  running: '作業中の記録あり',
  approved: '承認済み',
  paused: '一時停止',
  accepted: '全体検収済み',
  completed: '全体検収済み',
  done: '検収済み',
  pending: '未着手',
  submitted: '成果の確認待ち',
  in_progress: '進行中',
  blocked: '保留',
  failed: '失敗・再確認',
};
function wbError(error) {
  wbEl('error').textContent = error?.message ?? String(error);
  wbEl('notice').textContent = '';
  wbEl('error').focus();
}
function wbNotice(text) {
  wbEl('error').textContent = '';
  wbEl('notice').textContent = text;
}
function wbValidate(goal) {
  const result = validateGoal(goal);
  if (!result.ok) throw new Error(result.errors.join('\n'));
  return goal;
}
function wbCheckConcurrentSave() {
  let saved;
  try {
    saved = localStorage.getItem(wbStorageKey);
  } catch {
    return;
  }
  if (saved !== wbStoredRaw) {
    throw new Error(
      '別の画面で保存状態が変わりました。現在のJSONを保存してからページを再読込してください。',
    );
  }
}
function wbPersist() {
  try {
    const raw = JSON.stringify(wbGoal);
    localStorage.setItem(wbStorageKey, raw);
    wbStoredRaw = raw;
    wbEl('save-status').textContent = 'このブラウザに保存済み';
  } catch {
    wbEl('save-status').textContent = '保存できません・バックアップが必要';
    wbEl('persistence').textContent =
      'ブラウザ保存が利用できません。この画面を閉じる前にGoal JSONを保存してください。';
  }
}
function wbChoose(ids) {
  for (const box of document.querySelectorAll('[data-goal-squad]'))
    box.checked = ids.includes(box.value);
  wbRenderSelection();
}
function wbSquadName(id) {
  return (
    wbGoal?.squads.find((squad) => squad.id === id)?.name ??
    wbSources.mission.squads.find((squad) => squad.id === id)?.name ??
    id
  );
}
function wbSelectedSquads() {
  return [...document.querySelectorAll('[data-goal-squad]')]
    .filter((box) => box.checked)
    .map((box) => box.value);
}
function wbRenderSelection() {
  const ids = wbSelectedSquads();
  wbEl('selection-summary').textContent = ids.length
    ? ids.length +
      '部隊を選択中。今回の目的に必要な仕事か、下の内容を確認してください。'
    : '目的に合う部隊を選んでください。まだ計画は作成していません。';
  wbEl('selection-preview').innerHTML = ids
    .map((id) => {
      const squad = wbSources.mission.squads.find((item) => item.id === id);
      return (
        '<div class="selection-item"><strong>' +
        wbEscape(squad.name) +
        '</strong>' +
        wbList(
          squad.nextTaskIds.map(
            (taskId) =>
              wbSources.project.tasks.find((task) => task.id === taskId)
                ?.title ?? taskId,
          ),
        ) +
        '</div>'
      );
    })
    .join('');
}
function wbShowView(view, focus = true) {
  wbView = !wbGoal && view !== 'request' ? 'request' : view;
  wbEl('request-view').hidden = wbView !== 'request';
  wbEl('workspace').hidden = wbView === 'request';
  wbEl('plan-view').hidden = wbView !== 'plan';
  wbEl('progress-view').hidden = wbView !== 'progress';
  for (const name of ['request', 'plan', 'progress']) {
    wbEl('nav-' + name).setAttribute(
      'aria-current',
      wbView === name ? 'step' : 'false',
    );
    wbEl('nav-' + name).disabled = name !== 'request' && !wbGoal;
  }
  wbEl('page-title').textContent = 'AMCと、進めよう。';
  if (focus) {
    wbSurface = 'request';
    wbRenderSimple();
    wbEl('advanced-workbench').open = true;
    wbEl('inspector').open = wbView !== 'request';
    if (wbView === 'request') wbEl('chat-input').focus();
    else wbEl('inspector').scrollIntoView({ block: 'start' });
  }
}

// Local conversational guide only. Text never grants authority or executes work.
function wbChatPhase() {
  if (!wbGoal) return 'request';
  if (wbGoal.state !== 'draft') return 'active';
  return wbGoal.tasks.some((task) => task.scopeReviewRequired)
    ? 'blocked'
    : 'scope';
}
function wbChatFresh() {
  return {
    schema: 'amc-goal-chat/1',
    goalId: wbGoal?.id ?? null,
    goalRevision: wbGoal?.revision ?? null,
    phase: wbChatPhase(),
    instruction: wbGoal?.instruction ?? '',
    selectedSquadIds: wbGoal?.selectedSquadIds ?? [],
    coverage: '',
    criteria: '',
    messages: [],
  };
}
function wbChatAdd(role, text) {
  wbChat.messages.push({ role, text: String(text).slice(0, 16000) });
  // Keep a bounded local conversation. The Goal ledger is never truncated.
  if (wbChat.messages.length > 100)
    wbChat.messages = wbChat.messages.slice(-100);
}
function wbChatProgressText() {
  if (!wbGoal)
    return 'まだ計画はありません。まず、完成させたいことを教えてください。';
  const summary = summarizeGoal(wbGoal);
  return (
    '今回の目的：' +
    wbGoal.instruction +
    '\n' +
    '状態：' +
    wbNames[wbGoal.state] +
    '\n' +
    summary.leafTotal +
    '作業のうち、検収済み ' +
    summary.leafCompleted +
    '件。\n' +
    '作業中の記録 ' +
    summary.counts.running +
    '件、成果の確認待ち ' +
    summary.counts.submitted +
    '件。\n' +
    'これは保存された記録です。外部AIの稼働状況は自動取得していません。'
  );
}
function wbChatPromptForPhase() {
  return {
    request:
      '何を完成させたいですか？ まずは一言で教えてください。\n私はAMCのローカル案内です。登録済みの部隊と計画を使って整理します。',
    squads:
      '担当候補を確認してください。目的と関係のない作業があれば、部隊を調整できます。まだ計画は作成していません。',
    scope:
      '今回はどこまで進めますか？\n「進めること」と「今回はやらないこと」を教えてください。',
    criteria:
      '何を確認できれば完成ですか？\n合格条件を1行に1つずつ教えてください。',
    review:
      '範囲と合格条件がそろいました。内容を確認し、専用ボタンで承認してください。メッセージだけでは承認しません。',
    blocked:
      '計画に、成果物や合格条件が未整備の作業があります。まだ承認できません。「不足の補完を依頼する」で依頼文をコピーできます。',
    active:
      '計画と進捗をここで確認できます。AIへの引渡しはコピーで行い、実際に行った作業だけを詳細画面から記録します。',
  }[wbChat.phase];
}
function wbChatSave() {
  try {
    if (localStorage.getItem(wbChatStorageKey) !== wbChatStoredRaw)
      throw new Error('別の画面で会話が更新されています。');
    if (wbChatUnreadable) {
      wbEl('chat-storage-note').textContent =
        '読めない会話データを保持しています。退避してから、新しい会話の保存を選んでください。';
      return;
    }
    const raw = JSON.stringify(wbChat);
    localStorage.setItem(wbChatStorageKey, raw);
    wbChatStoredRaw = raw;
    wbEl('chat-storage-note').textContent =
      '直近100発言をこのブラウザに保存。計画のバックアップに会話本文は含まれません。秘密は入力しないでください。';
  } catch {
    wbEl('chat-storage-note').textContent =
      '会話を保存できません。別画面との競合または保存制限があります。必要な会話は控えてから再読み込みしてください。';
  }
}
function wbChatRender() {
  if (!wbChat) return;
  wbEl('chat-log').innerHTML = wbChat.messages
    .map(
      (message) =>
        '<article class="chat-message chat-' +
        (message.role === 'user' ? 'user' : 'guide') +
        '">' +
        '<div class="chat-speaker">' +
        (message.role === 'user' ? 'あなた' : 'AMC · ローカル案内') +
        '</div>' +
        '<div class="chat-text">' +
        wbEscape(message.text) +
        '</div></article>',
    )
    .join('');
  const context = {
    request: 'まずは、やりたいことをひとつ。',
    squads: '担当候補を確認してください。目的の書き直しもできます。',
    scope: '今回進める範囲と、やらないことを教えてください。',
    criteria: '完成の基準を、1行に1つずつ教えてください。',
    review: '承認する前に、範囲と完成の基準を確認してください。',
    blocked: '不足している計画の確認が必要です。',
    active: '進捗を確認できます。作業の記録は「進捗の詳細」から。',
  };
  wbEl('chat-context').textContent = context[wbChat.phase];
  wbEl('chat-input').placeholder = {
    request: '例：Proの保存・復旧の設計を進めたい',
    squads: '目的を書き直す場合は、ここに入力',
    scope: '進めること：保存・復旧の設計\nやらないこと：実機への導入',
    criteria: '例：失敗時の復旧手順がある\n担当と確認方法が決まっている',
    review: '修正は下のボタンから。送信だけでは承認されません',
    blocked: '相談メモを残す（AIの自動回答は未接続）',
    active: '進捗についてのメモを書く',
  }[wbChat.phase];
  const actions = [];
  if (wbChat.phase === 'squads') {
    if (wbSelectedSquads().length)
      actions.push(['make-plan', 'この部隊で計画案をつくる']);
    actions.push(['edit-squads', '担当部隊を調整する']);
  } else if (wbChat.phase === 'review') {
    actions.push(
      ['approve', 'この範囲と条件で計画を承認する'],
      ['edit-scope', '範囲を直す'],
      ['edit-criteria', '完成の基準を直す'],
    );
  } else if (wbChat.phase === 'criteria') {
    actions.push(['edit-scope', '範囲を直す']);
  } else if (wbChat.phase === 'blocked') {
    actions.push(['repair', '不足の補完を依頼する']);
  } else if (wbChat.phase === 'active') {
    if (wbGoal?.state === 'active')
      actions.push(['copy-prompt', 'AIに渡す指示をコピー']);
    actions.push(
      ['status', 'いまの進捗を教えて'],
      ['show-progress', '進捗の詳細・結果を記録'],
    );
  }
  if (wbGoal)
    actions.push(
      ['show-plan', '計画の詳細'],
      ['save-goal', '計画をバックアップ'],
    );
  if (wbChat.messages.some((message) => message.role === 'user'))
    actions.push(['save-chat', '会話を保存']);
  if (wbChatUnreadable)
    actions.push(
      ['save-chat-backup', '読めない会話を退避'],
      ['replace-chat', '今の会話で保存し直す'],
    );
  wbEl('chat-actions').innerHTML = actions
    .map(
      ([action, label], index) =>
        '<button type="button" data-chat-action="' +
        action +
        '"' +
        (index === 0 ? ' class="primary"' : '') +
        '>' +
        label +
        '</button>',
    )
    .join('');
  wbEl('chat-empty-help').hidden = wbChat.messages.some(
    (message) => message.role === 'user',
  );
  wbEl('new-goal').hidden = false;
}
function wbChatCommit() {
  wbChatSave();
  wbChatRender();
  wbEl('chat-log').scrollTop = wbEl('chat-log').scrollHeight;
}
function wbChatCandidates() {
  const ids = wbSelectedSquads();
  const lines = ids.map((id) => {
    const squad = wbSources.mission.squads.find((item) => item.id === id);
    return (
      '・' +
      squad.name +
      '：' +
      squad.nextTaskIds
        .map(
          (taskId) =>
            wbSources.project.tasks.find((task) => task.id === taskId)?.title ??
            taskId,
        )
        .join(' / ')
    );
  });
  return ids.length
    ? '言葉の一致から、' +
        ids.length +
        '部隊を候補にしました。既存の予定は次のとおりです。\n\n' +
        lines.slice(0, 6).join('\n') +
        (lines.length > 6
          ? '\nほか' + (lines.length - 6) + '部隊。詳細ですべて確認できます。'
          : '') +
        '\n\n今回の目的に必要な仕事か確認してください。新しい課題をAIが考えた結果ではありません。'
    : 'この目的に合う部隊を特定できませんでした。「担当部隊を調整する」から選んでください。適した既存計画がなければ、無理に承認しないでください。';
}
function wbChatPlanCreated() {
  if (!wbChat) return;
  wbChat.goalId = wbGoal.id;
  wbChat.goalRevision = wbGoal.revision;
  wbChat.instruction = wbGoal.instruction;
  wbChat.selectedSquadIds = wbGoal.selectedSquadIds;
  wbChat.coverage = '';
  wbChat.criteria = '';
  wbChat.phase = wbChatPhase();
  wbChatAdd(
    'guide',
    '計画案を作成しました。' +
      wbEl('plan-counts').textContent +
      '\n前提として他の部隊の作業が含まれることがあります。「計画の詳細」で内容を確認できます。\nまだ承認・実行はしていません。',
  );
  wbChatAdd('guide', wbChatPromptForPhase());
  wbChatCommit();
}
function wbChatGoalChanged(event) {
  if (!wbChat) return;
  wbChat.goalId = wbGoal.id;
  wbChat.goalRevision = wbGoal.revision;
  wbChat.phase = wbChatPhase();
  if (event.type === 'approve_plan') {
    wbChat.coverage = wbGoal.approval.coverageStatement;
    wbChat.criteria = wbGoal.overallAcceptance.criteria
      .map((criterion) => criterion.criterion)
      .join('\n');
  }
  wbChatAdd(
    'guide',
    event.type === 'approve_plan'
      ? '次の内容で計画を承認して記録しました。\n\n範囲・対象外：\n' +
          wbChat.coverage +
          '\n\n完成の基準：\n' +
          wbChat.criteria +
          '\n\n次は「AIに渡す指示をコピー」で使うAIへ渡してください。AIはまだ起動していません。'
      : '進捗の記録を更新しました。外部処理は実行していません。\n\n' +
          wbChatProgressText(),
  );
  wbChatCommit();
}
function wbChatRestore() {
  wbChat = wbChatFresh();
  try {
    wbChatStoredRaw = localStorage.getItem(wbChatStorageKey);
    if (wbChatStoredRaw) {
      if (wbChatStoredRaw.length > 2_000_000)
        throw new Error('Chat size limit');
      const saved = JSON.parse(wbChatStoredRaw);
      const text = (value, max = 8000) =>
        typeof value === 'string' && value.length <= max;
      if (
        !saved ||
        saved.schema !== 'amc-goal-chat/1' ||
        ![
          'request',
          'squads',
          'scope',
          'criteria',
          'review',
          'blocked',
          'active',
        ].includes(saved.phase) ||
        !['instruction', 'coverage', 'criteria'].every((key) =>
          text(saved[key]),
        ) ||
        !Array.isArray(saved.selectedSquadIds) ||
        saved.selectedSquadIds.length > 32 ||
        !saved.selectedSquadIds.every(
          (id) =>
            wbSources.mission.squads.some((squad) => squad.id === id) ||
            (saved.goalId === wbGoal?.id &&
              wbGoal.squads.some((squad) => squad.id === id)),
        ) ||
        !Array.isArray(saved.messages) ||
        saved.messages.length > 100 ||
        !saved.messages.every(
          (message) =>
            message &&
            ['user', 'guide'].includes(message.role) &&
            text(message.text, 16000),
        )
      )
        throw new Error('Invalid chat backup');
      if (
        saved.goalId === (wbGoal?.id ?? null) &&
        saved.goalRevision === (wbGoal?.revision ?? null) &&
        (['request', 'squads'].includes(saved.phase) ||
          (wbGoal?.state === 'draft' &&
            ['scope', 'criteria', 'review', 'blocked'].includes(saved.phase)) ||
          (wbGoal && wbGoal.state !== 'draft' && saved.phase === 'active'))
      ) {
        wbChat = saved;
        wbEl('instruction').value = saved.instruction;
        wbEl('coverage').value = saved.coverage;
        wbEl('goal-criteria').value = saved.criteria;
        wbChoose(saved.selectedSquadIds);
        wbEl('team-picker').hidden = saved.phase !== 'squads';
        wbChatRender();
        return;
      }
    }
  } catch {
    wbChatUnreadable = Boolean(wbChatStoredRaw);
    wbEl('chat-storage-note').textContent =
      '会話の保存内容を復元できません。元の内容は保持しています。計画の記録とは別です。';
  }
  if (wbGoal)
    wbChatAdd(
      'guide',
      '保存された計画を表示しています。\n\n' + wbChatProgressText(),
    );
  wbChatAdd('guide', wbChatPromptForPhase());
  wbChatRender();
}
function wbTaskHint(task, summary) {
  if (task.status === 'done') return '成果と証拠を確認済み';
  if (task.status === 'submitted') return '作業した人とは別の担当が確認';
  if (task.status === 'running') return '実施した結果と成果物を記録';
  if (task.status === 'blocked' || task.status === 'failed')
    return (
      task.blockReason || task.result?.summary || '理由と再開条件の確認が必要'
    );
  if (task.holds?.length) return '実行保留の条件があります';
  if (task.executionEligibility === 'authority_required')
    return '実行先・権限の接続待ち';
  if (wbGoal.state === 'draft') return '計画の承認前';
  if (wbGoal.state === 'paused') return 'Goalの記録を一時停止中';
  if (summary.readyTaskIds.includes(task.id))
    return task.executionMode === 'review_existing_evidence'
      ? '既存の成果を確認できます'
      : '前提がそろっています';
  return '前の作業・確認・同時作業枠を待っています';
}
function wbTaskMatches(task, filter, summary) {
  return (
    filter === 'all' ||
    (filter === 'ready' && summary.readyTaskIds.includes(task.id)) ||
    (filter === 'running' && task.status === 'running') ||
    (filter === 'review' && task.status === 'submitted') ||
    (filter === 'done' && task.status === 'done') ||
    (filter === 'blocked' &&
      (['blocked', 'failed'].includes(task.status) ||
        (task.status !== 'done' &&
          (task.holds?.length ||
            task.executionEligibility === 'authority_required'))))
  );
}
function wbRenderTaskList() {
  if (!wbGoal) return;
  const summary = summarizeGoal(wbGoal);
  const visible = wbGoal.tasks.filter((task) =>
    wbTaskMatches(task, wbEl('task-filter').value || 'all', summary),
  );
  wbEl('task-count').textContent = visible.length + '件を表示';
  wbEl('task-list').innerHTML = visible.length
    ? visible
        .map(
          (task) =>
            '<button type="button" class="task-item" data-task-id="' +
            wbEscape(task.id) +
            '" aria-pressed="' +
            (task.id === wbSelectedTask) +
            '"><span class="small muted">' +
            wbEscape(wbSquadName(task.squadId)) +
            ' · ' +
            wbEscape(task.id) +
            '</span><strong>' +
            wbEscape(task.title) +
            '</strong><span class="status-pill">' +
            wbEscape(wbNames[task.status]) +
            '</span><span class="small muted">' +
            wbEscape(wbTaskHint(task, summary)) +
            '</span></button>',
        )
        .join('')
    : '<p class="muted">この状態の作業はありません。別の表示に切り替えてください。</p>';
}
function wbRecordOptions() {
  if (!wbGoal) return [];
  const task = wbGoal.tasks.find((item) => item.id === wbSelectedTask);
  if (wbGoal.state === 'draft' || wbGoal.state === 'accepted') return [];
  const summary = summarizeGoal(wbGoal);
  const options = [];
  if (task && summary.readyTaskIds.includes(task.id))
    options.push(['start_task', 'この作業を開始したと記録する']);
  if (task?.status === 'running')
    options.push(['submit_result', 'この作業の結果を記録する']);
  if (task?.status === 'submitted')
    options.push(['verify_task', 'この成果の確認結果を記録する']);
  if (task && ['pending', 'failed'].includes(task.status))
    options.push(['block_task', 'この作業を保留する']);
  if (wbGoal.state === 'paused')
    return [...options, ['resume', 'Goalの記録を再開する']];
  if (task && ['blocked', 'failed'].includes(task.status) && !task.holds.length)
    options.push(['resume_task', 'この作業の再開条件を記録する']);
  if (wbGoal.tasks.every((item) => item.status === 'done'))
    options.push(['accept_goal', 'Goal全体の達成を確認する']);
  options.push(['pause', 'Goal全体の記録を一時停止する']);
  return options;
}
function wbRenderRecordFields() {
  const type = wbEl('event-type').value;
  const verifying = ['verify_task', 'accept_goal'].includes(type);
  wbEl('field-outcome').hidden = !verifying && type !== 'submit_result';
  wbEl('field-summary').hidden = ![
    'submit_result',
    'block_task',
    'resume_task',
    'pause',
  ].includes(type);
  wbEl('field-deliverables').hidden = type !== 'submit_result';
  wbEl('field-evidence').hidden =
    !verifying && !['submit_result', 'resume_task'].includes(type);
  wbEl('record-help').textContent = verifying
    ? '成果物と全ての合格条件を確認してください。作業の検収は、実行者とは別の担当が記録します。名前は自己申告です。'
    : type === 'pause' || type === 'resume'
      ? 'ここでは記録だけを停止・再開します。外部のAIや作業は停止・再開されません。'
      : '実際に行ったことだけを記録してください。この操作でAIや作業が起動することはありません。';
  wbEl('record').textContent =
    wbRecordOptions().find(([value]) => value === type)?.[1] ?? '記録する';
}
function wbRenderRecordOptions() {
  const options = wbRecordOptions();
  const previous = wbEl('event-type').value;
  const value = options.some(([id]) => id === previous)
    ? previous
    : (options[0]?.[0] ?? '');
  wbEl('event-type').innerHTML = options
    .map(([id, label]) => '<option value="' + id + '">' + label + '</option>')
    .join('');
  wbEl('event-type').value = value;
  wbEl('record-section').hidden = !options.length;
  wbRenderRecordFields();
}
function wbRenderTask() {
  const task = wbGoal.tasks.find((item) => item.id === wbSelectedTask);
  if (!task) return;
  const rows = [
    ['Goal / 作業', task.title],
    ['担当', wbSquadName(task.squadId)],
    ['状態', wbNames[task.status] ?? task.status],
    ['元の記録', wbNames[task.sourceStatus] ?? task.sourceStatus],
    [
      '着手の区分',
      {
        local_work: 'ローカル作業',
        review_only: '証拠・親条件の検収',
        authority_required:
          '実行先・権限・資源の接続待ち（第一版では開始不可）',
      }[task.executionEligibility],
    ],
    [
      '階層',
      task.parentTaskId
        ? '子作業 / 親 ' + task.parentTaskId
        : wbGoal.tasks.some((item) => item.parentTaskId === task.id)
          ? '親の検収Gate（件数から除外）'
          : '独立作業',
    ],
    [
      '前提',
      (task.dependsOn ?? [])
        .map((id) => {
          const dependency = wbGoal.tasks.find((item) => item.id === id);
          return (
            (dependency?.title ?? id) +
            '（' +
            (wbNames[dependency?.status] ?? '未確認') +
            '）'
          );
        })
        .join(' / ') || 'なし',
    ],
    [
      '実行範囲',
      task.executionBoundary ??
        task.completionScope ??
        task.executionMode ??
        '計画案で確認',
    ],
  ];
  wbEl('task-detail').innerHTML =
    '<div class="eyebrow">' +
    wbEscape(task.id) +
    '</div><h3>' +
    wbEscape(task.title) +
    '</h3><p class="task-hint">' +
    wbEscape(wbTaskHint(task, summarizeGoal(wbGoal))) +
    '</p>' +
    '<h4>できあがるもの</h4>' +
    wbList(
      (task.deliverables ?? []).map((item) =>
        typeof item === 'string'
          ? item
          : item.description || item.section || item.path,
      ),
    ) +
    '<h4>完了と認める条件</h4>' +
    wbList(
      (task.acceptanceCriteria ?? []).map(
        (criterion) => criterion.criterion ?? criterion,
      ),
    ) +
    '<details><summary>手順・依存関係・ファイルを見る</summary><dl>' +
    rows
      .map(
        ([name, value]) =>
          '<dt>' + wbEscape(name) + '</dt><dd>' + wbEscape(value) + '</dd>',
      )
      .join('') +
    '</dl>' +
    '<h3>進め方</h3>' +
    wbList(
      (task.steps ?? []).map((step) =>
        typeof step === 'string' ? step : step.action,
      ),
    ) +
    '<h3>成果物</h3>' +
    wbList(
      (task.deliverables ?? []).map((item) =>
        typeof item === 'string'
          ? item
          : item.path + (item.section ? '#' + item.section : ''),
      ),
    ) +
    '</details>' +
    (task.result
      ? '<details><summary>提出された結果を見る</summary><p>' +
        wbEscape(task.result.summary) +
        '</p><h4>成果物</h4>' +
        wbList(task.result.deliverables ?? []) +
        '<h4>証拠</h4>' +
        wbList(task.result.evidence ?? []) +
        '</details>'
      : '') +
    (task.executionMode === 'review_existing_evidence'
      ? '<p class="small muted">既存成果の証拠を再確認する作業です。再実装や無条件の合格移管は行いません。</p>'
      : '') +
    ((task.holds ?? []).length
      ? '<h3>実行保留</h3>' +
        wbList(
          task.holds.map((hold) =>
            typeof hold === 'string' ? hold : hold.scope + ' / ' + hold.reason,
          ),
        )
      : '');
  wbRenderRecordOptions();
}
function wbRenderNext(summary) {
  const submitted = wbGoal.tasks.find((task) => task.status === 'submitted');
  const running = wbGoal.tasks.find((task) => task.status === 'running');
  let title, description, label;
  wbNextAction = null;
  if (wbGoal.state === 'draft') {
    title = 'まず、計画を確認してください';
    description =
      'まだ承認されていません。目的と関係のない仕事が含まれていないかを確認します。';
    label = '計画の確認へ';
    wbNextAction = { view: 'plan' };
  } else if (wbGoal.state === 'accepted') {
    title = 'このGoalは検収済みです';
    description = '成果と確認履歴を残すため、バックアップを保存してください。';
    label = '完了した記録を保存する';
    wbNextAction = { download: true };
  } else if (wbGoal.state === 'paused') {
    title = 'Goalの記録を一時停止しています';
    description =
      (wbGoal.pauseReason || '') +
      '。外部作業の状態は別途確認してください。停止中も到着した結果の記録はできます。';
    label = '再開の記録へ';
    wbNextAction = { event: 'resume' };
  } else if (submitted) {
    title = '確認してほしい成果があります';
    description =
      submitted.title +
      '。実行した人とは別の担当が、合格条件と証拠を確認します。';
    label = '成果を確認する';
    wbNextAction = { taskId: submitted.id, event: 'verify_task' };
  } else if (running) {
    title = '作業の結果を記録してください';
    description =
      running.title + '。AMCは外部AIの実行状況を自動取得していません。';
    label = '結果を記録する';
    wbNextAction = { taskId: running.id, event: 'submit_result' };
  } else if (wbGoal.tasks.every((task) => task.status === 'done')) {
    title = '最後に、Goal全体を確認しましょう';
    description =
      '各作業の検収がそろいました。最初に決めた全体の合格条件を確認します。';
    label = 'Goalの達成を確認する';
    wbNextAction = { event: 'accept_goal' };
  } else if (summary.readyTaskIds.length) {
    title = '計画の準備ができました';
    description =
      '次は指示文をAIに貼り付け、バックアップも渡します。コピーだけでは実行は始まりません。';
    label = 'AIに渡す指示をコピー';
    wbNextAction = { copy: true };
  } else {
    title = '進めるための確認が必要です';
    description =
      '実行保留・権限・前提作業を確認してください。条件がそろうまで作業は開始できません。';
    label = '待っている理由を見る';
    const waiting = wbGoal.tasks.find((task) => task.status !== 'done');
    wbNextAction = { taskId: waiting?.id };
  }
  wbEl('next-title').textContent = title;
  wbEl('next-description').textContent = description;
  wbEl('next-action').textContent = label;
}
function wbRender() {
  wbRenderSimple();
  wbEl('save-json-top').hidden = !wbGoal;
  wbEl('new-goal').hidden = false;
  wbShowView(wbView, false);
  if (!wbGoal) {
    wbEl('chat-plan-summary').textContent = 'まだ計画はありません';
    return;
  }
  const summary = summarizeGoal(wbGoal);
  wbEl('chat-plan-summary').textContent =
    '保存中のGoal：' +
    wbNames[wbGoal.state] +
    ' · ' +
    summary.leafCompleted +
    ' / ' +
    summary.leafTotal +
    '作業を検収済み';
  const parentIds = new Set(
    wbGoal.tasks.map((task) => task.parentTaskId).filter(Boolean),
  );
  const leaves = wbGoal.tasks.filter((task) => !parentIds.has(task.id));
  const done = leaves.filter((task) => task.status === 'done');
  wbEl('goal-summary').textContent =
    (wbNames[wbGoal.state] ?? wbGoal.state) +
    ' / ' +
    done.length +
    ' / ' +
    leaves.length +
    ' 作業を検収済み。AIの稼働状況ではありません。';
  const missing = wbGoal.tasks.filter(
    (task) =>
      task.scopeReviewRequired ||
      !(task.acceptanceCriteria ?? []).length ||
      !(task.deliverables ?? []).length,
  );
  wbEl('goal-title').textContent = wbGoal.instruction;
  wbEl('plan-counts').textContent =
    new Set(wbGoal.tasks.map((task) => task.squadId)).size +
    '部隊 · ' +
    leaves.length +
    '作業 · 全体の確認 ' +
    parentIds.size +
    '件';
  wbEl('goal-warning').textContent =
    '作業数は製品の完成率ではありません。親の作業とGoal全体は別に確認します。';
  wbEl('approval-blocker').hidden = !missing.length;
  wbEl('approval-blocker').innerHTML =
    '<strong>まだ承認できません</strong><p>次の作業に成果物または合格条件がありません。補完依頼をコピーして、この会話のAIに渡してください。</p>' +
    wbList(missing.map((task) => task.title + '（' + task.id + '）'));
  wbEl('approve').disabled = missing.length > 0;
  wbEl('repair-prompt').hidden = !missing.length;
  const squadIds = [...new Set(wbGoal.tasks.map((task) => task.squadId))];
  wbEl('plan-outline').innerHTML = squadIds
    .map((id) => {
      const own = leaves.filter((task) => task.squadId === id);
      const inherited = !wbGoal.selectedSquadIds.includes(id);
      return (
        '<details class="plan-squad"><summary>' +
        wbEscape(wbSquadName(id)) +
        ' · ' +
        own.length +
        '作業' +
        (inherited ? '（前提として必要）' : '') +
        '</summary>' +
        wbList(own.map((task) => task.title)) +
        '</details>'
      );
    })
    .join('');
  wbEl('squad-progress').innerHTML = squadIds
    .map((id) => {
      const own = leaves.filter((task) => task.squadId === id);
      const squad = wbGoal.squads.find((item) => item.id === id);
      return (
        '<div class="squad-card"><div><span class="small muted">' +
        wbEscape(id) +
        '</span><strong>' +
        wbEscape(squad?.name ?? '') +
        '</strong></div><div>' +
        own.filter((task) => task.status === 'done').length +
        ' / ' +
        own.length +
        ' 検収済み</div><span class="small muted">作業中の記録 ' +
        own.filter((task) => ['running', 'in_progress'].includes(task.status))
          .length +
        ' · 確認待ち ' +
        own.filter((task) => task.status === 'submitted').length +
        '</span></div>'
      );
    })
    .join('');
  if (!wbGoal.tasks.some((task) => task.id === wbSelectedTask))
    wbSelectedTask =
      summary.readyTaskIds[0] ?? leaves[0]?.id ?? wbGoal.tasks[0]?.id ?? '';
  wbEl('task-select').innerHTML = wbGoal.tasks
    .map(
      (task) =>
        '<option value="' +
        wbEscape(task.id) +
        '"' +
        (task.id === wbSelectedTask ? ' selected' : '') +
        '>' +
        wbEscape(
          task.id +
            ' / ' +
            (wbNames[task.status] ?? task.status) +
            ' / ' +
            task.title,
        ) +
        '</option>',
    )
    .join('');
  wbRenderTask();
  wbRenderTaskList();
  wbRenderNext(summary);
  wbEl('prompt').value = renderGoalPrompt(wbGoal);
  wbEl('approval-section').hidden = wbGoal.state !== 'draft';
  wbEl('approval-section').open = true;
  wbEl('approved-plan').hidden = wbGoal.state === 'draft';
  wbEl('approved-content').innerHTML = wbGoal.approval
    ? '<h4>承認された範囲</h4><p>' +
      wbEscape(wbGoal.approval.coverageStatement) +
      '</p><h4>全体の合格条件</h4>' +
      wbList(
        (wbGoal.overallAcceptance?.criteria ?? []).map(
          (criterion) => criterion.criterion,
        ),
      )
    : '';
  wbEl('event-history').innerHTML = (wbGoal.eventLog ?? [])
    .map(
      (event) =>
        '<li>' +
        wbEscape(
          [
            event.at,
            {
              approve_plan: '計画を承認',
              start_task: '開始の記録',
              submit_result: '成果の提出',
              verify_task: '成果の確認',
              block_task: '保留',
              resume_task: '再開条件の記録',
              pause: '記録の一時停止',
              resume: '記録の再開',
              accept_goal: '全体の検収',
            }[event.type] ?? event.type,
            event.taskId,
            event.actor,
          ]
            .filter(Boolean)
            .join(' / '),
        ) +
        '</li>',
    )
    .join('');
}
function wbApply(event) {
  if (!wbGoal) throw new Error('まず計画案を作成してください。');
  wbCheckConcurrentSave();
  const next = applyGoalEvent(wbGoal, {
    id:
      'event-' +
      (globalThis.crypto?.randomUUID?.() ??
        Date.now() + '-' + Math.random().toString(36).slice(2)),
    expectedRevision: wbGoal.revision,
    actor: wbEl('actor').value.trim(),
    at: new Date().toISOString(),
    ...event,
  });
  wbGoal = wbValidate(next);
  wbPersist();
  wbRender();
  wbChatGoalChanged(event);
  wbNotice('進捗を記録しました。外部処理は実行していません。');
}
function wbDownload(content, name, type) {
  const url = URL.createObjectURL(new Blob([content], { type }));
  const link = document.createElement('a');
  link.href = url;
  link.download = name;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
function wbOn(id, type, callback) {
  wbEl(id).addEventListener(type, async (event) => {
    try {
      await callback(event);
    } catch (error) {
      wbError(error);
      if (wbChat && ['chat-form', 'chat-input', 'chat-actions'].includes(id)) {
        wbChatAdd(
          'guide',
          'この操作は進められませんでした。\n' +
            (error?.message ?? String(error)),
        );
        wbChatCommit();
      }
    }
  });
}
wbEl('source').textContent =
  wbSources.mission.squads.length +
  '部隊 / ' +
  wbSources.project.tasks.length +
  '登録レコード / 正本snapshot ' +
  wbSources.mission.updatedAt +
  ' / GitHub最新確認なし';
wbEl('squads').innerHTML = wbSources.mission.divisions
  .map(
    (division) =>
      '<details class="division-picker"><summary>' +
      wbEscape(division.name) +
      '</summary><fieldset><legend class="sr-only">' +
      wbEscape(division.name) +
      '</legend>' +
      wbSources.mission.squads
        .filter((squad) => squad.division === division.id)
        .map(
          (squad) =>
            '<label class="check"><input type="checkbox" data-goal-squad value="' +
            wbEscape(squad.id) +
            '"><span>' +
            wbEscape(squad.name) +
            '<small class="muted">' +
            wbEscape(squad.id) +
            '</small>' +
            '</span></label>',
        )
        .join('') +
      '</fieldset></details>',
  )
  .join('');
function wbRecommend() {
  if (!wbEl('instruction').value.trim()) {
    wbEl('instruction').focus();
    throw new Error('まず、完成させたいことを一言で入力してください。');
  }
  const ids = recommendSquads(wbEl('instruction').value, wbSources.mission);
  wbChoose(ids);
  wbEl('team-picker').hidden = false;
  wbEl('recommend').className = '';
  wbEl('selection-summary').focus();
  wbNotice(
    ids.length
      ? '候補を選択しました。必要な部隊を確認・調整してください。'
      : 'この指示の部隊を判定できません。対象部隊を選んでください。',
  );
}
wbOn('recommend', 'click', () => {
  wbRecommend();
  wbChat.instruction = wbEl('instruction').value.trim();
  wbChat.selectedSquadIds = wbSelectedSquads();
  wbChat.phase = 'squads';
  wbChatAdd('user', wbChat.instruction);
  wbChatAdd('guide', wbChatCandidates());
  wbChatCommit();
});
wbOn('squads', 'change', () => {
  wbRenderSelection();
  if (wbChat?.phase === 'squads') {
    wbChat.selectedSquadIds = wbSelectedSquads();
    wbChatCommit();
  }
});
wbOn('instruction', 'input', () => {
  if (!wbEl('team-picker').hidden)
    wbEl('selection-summary').textContent =
      '指示が変わりました。担当部隊と予定する仕事が合っているか、もう一度確認してください。';
});
function wbChatChoose(ids) {
  wbChoose(ids);
  if (wbChat?.phase === 'squads') {
    wbChat.selectedSquadIds = ids;
    wbChatCommit();
  }
}
wbOn('select-all', 'click', () =>
  wbChatChoose(wbSources.mission.squads.map((squad) => squad.id)),
);
wbOn('select-none', 'click', () => wbChatChoose([]));
function wbCompilePlan() {
  if (!wbSelectedSquads().length)
    throw new Error('今回の目的に合う部隊を一つ以上選んでください。');
  if (
    (wbGoal || wbUnreadableRaw) &&
    !window.confirm(
      '現在の保存内容を新しい計画案に置き換えます。読めなかった内容も退避できます。必要なら先にJSONを保存してください。続けますか？',
    )
  )
    return false;
  wbCheckConcurrentSave();
  const goal = compileGoal({
    instruction: wbEl('instruction').value,
    squadIds: wbSelectedSquads(),
    maxParallel: Number(wbEl('parallel').value),
    createdAt: new Date().toISOString(),
    mission: wbSources.mission,
    project: wbSources.project,
  });
  goal.sourceFiles = wbSources.provenance;
  wbGoal = wbValidate(goal);
  wbSimpleMode = null;
  wbSelectedTask = '';
  wbEl('coverage').value = '';
  wbEl('goal-criteria').value = '';
  wbEl('task-filter').value = 'all';
  wbView = 'plan';
  wbPersist();
  wbRender();
  wbShowView('plan');
  wbNotice(
    '計画案を作成しました。指示の網羅性と合格条件をレビューしてから承認してください。',
  );
  wbChatPlanCreated();
  return true;
}
wbOn('compile-form', 'submit', (event) => {
  event.preventDefault();
  wbCompilePlan();
});
wbOn('task-select', 'change', (event) => {
  wbSelectedTask = event.target.value;
  wbClearResultForm();
  wbEl('record-section').open = false;
  wbRenderTask();
  wbRenderTaskList();
});
wbOn('task-list', 'click', (event) => {
  const button = event.target.closest('[data-task-id]');
  if (!button) return;
  wbSelectedTask = button.getAttribute('data-task-id');
  wbEl('task-select').value = wbSelectedTask;
  wbEl('record-section').open = false;
  wbClearResultForm();
  wbRenderTask();
  wbRenderTaskList();
  wbEl('task-detail').focus();
});
wbOn('task-filter', 'change', wbRenderTaskList);
wbOn('event-type', 'change', wbRenderRecordFields);
function wbApprovePlan() {
  if (!wbEl('coverage').value.trim())
    throw new Error(
      'この計画で進める範囲と、今回は行わないことを入力してください。',
    );
  if (!wbLines('goal-criteria').length)
    throw new Error('何ができれば完成か、全体の合格条件を入力してください。');
  wbApply({
    type: 'approve_plan',
    role: 'owner',
    scopeConfirmed: true,
    coverageStatement: wbEl('coverage').value.trim(),
    acceptanceCriteria: wbLines('goal-criteria').map((criterion, i) => ({
      id: 'GOAL-AC' + (i + 1),
      criterion,
    })),
  });
  wbShowView('progress');
  wbNotice(
    '計画を承認しました。次はAIへの引渡しです。まだ実行は始まっていません。',
  );
}
wbOn('approve', 'click', wbApprovePlan);
function wbClearResultForm() {
  for (const id of ['result-summary', 'deliverables', 'evidence'])
    wbEl(id).value = '';
  wbEl('outcome').value = 'succeeded';
}
wbOn('record', 'click', () => {
  if (!wbGoal) throw new Error('計画がありません。');
  const task = wbGoal.tasks.find((item) => item.id === wbSelectedTask);
  const type = wbEl('event-type').value;
  const passed = wbEl('outcome').value === 'succeeded';
  const evidence = wbLines('evidence');
  const event = {
    type,
    taskId: task?.id,
    reason: wbEl('result-summary').value.trim(),
    summary: wbEl('result-summary').value.trim(),
    evidence,
  };
  if (type === 'resume_task') event.role = 'owner';
  if (type === 'submit_result')
    Object.assign(event, {
      outcome: passed ? 'succeeded' : 'failed',
      deliverables: wbLines('deliverables'),
    });
  if (type === 'verify_task' || type === 'accept_goal') {
    if (
      !window.confirm(
        '対象の全合格条件と証拠を確認しましたか？この操作は自己申告の検収記録です。',
      )
    )
      return;
    const criteria =
      type === 'verify_task'
        ? task.acceptanceCriteria
        : (wbGoal.overallAcceptance?.criteria ??
          wbGoal.overallAcceptance?.acceptanceCriteria ??
          []);
    Object.assign(event, {
      role: type === 'verify_task' ? 'reviewer' : 'owner',
      accepted: passed,
      criterionResults: criteria.map((criterion) => ({
        criterionId: criterion.id,
        passed,
        evidence,
      })),
    });
  }
  wbApply(event);
  wbClearResultForm();
  wbEl('record-section').open = false;
});
async function wbCopy(text, repair = false) {
  try {
    await navigator.clipboard.writeText(text);
    wbNotice(
      repair
        ? '補完依頼をコピーしました。この会話に貼り付け、バックアップも添付してください。まだ送信していません。'
        : '指示文をコピーしました。AIに貼り付け、バックアップも渡してください。AMCからは送信・実行していません。',
    );
  } catch {
    wbEl('prompt').value = text;
    wbShowView('progress');
    wbEl('prompt').closest('details').open = true;
    wbEl('prompt')
      .closest('details')
      .parentElement?.closest('details')
      ?.setAttribute('open', '');
    wbEl('prompt').focus();
    wbEl('prompt').select();
    wbNotice(
      'コピー機能が利用できません。選択した指示文を手動でコピーしてください。',
    );
  }
}
wbOn('copy-prompt', 'click', () => wbCopy(renderGoalPrompt(wbGoal)));
function wbRepairPrompt() {
  return wbCopy(
    'このAMCの計画案は未承認です。添付するバックアップJSONのうち、合格条件または成果物が不足している作業だけを補完する案を作ってください。目的・対象・権限を増やさず、実行や承認はしないでください。変更内容を先に説明し、確認後に読み込めるJSONを返してください。\n\n' +
      renderGoalPrompt(wbGoal),
    true,
  );
}
wbOn('repair-prompt', 'click', wbRepairPrompt);
wbOn('save-prompt', 'click', () =>
  wbDownload(
    renderGoalPrompt(wbGoal),
    'amc-goal-prompt-r' + wbGoal.revision + '.md',
    'text/markdown;charset=utf-8',
  ),
);
function wbSaveGoal() {
  if (!wbGoal) throw new Error('保存する計画がまだありません。');
  wbDownload(
    JSON.stringify(wbGoal, null, 2),
    'amc-goal-r' + wbGoal.revision + '.json',
    'application/json',
  );
  wbNotice(
    'バックアップの保存を要求しました。保存先でファイルを確認してください。',
  );
}
wbOn('save-json', 'click', wbSaveGoal);
wbOn('save-json-top', 'click', wbSaveGoal);
wbOn('board-tab', 'click', () => {
  wbSurface = 'board';
  wbRenderSimple();
});
wbOn('request-tab', 'click', () => {
  wbSurface = 'request';
  wbRenderSimple();
});
for (const view of ['request', 'plan', 'progress'])
  wbOn('nav-' + view, 'click', () => wbShowView(view));
wbOn('new-goal', 'click', () => {
  const hasBriefDraft =
    wbSimpleMode === 'review' ||
    ((!wbGoal || wbSimpleMode === 'home') &&
      Boolean(wbEl('simple-request').value.trim()));
  if (
    (hasBriefDraft ||
      wbChat.messages.some((message) => message.role === 'user')) &&
    !window.confirm(
      hasBriefDraft
        ? '入力途中の依頼・Goal・意図を破棄して、新しい依頼を始めますか？確定済みのGoalは保持します。'
        : '会話を新しくします。残したい内容は先に「会話を保存」を使ってください。現在のGoalは保持します。続けますか？',
    )
  )
    return;
  wbEl('instruction').value = '';
  wbChoose([]);
  wbEl('team-picker').hidden = true;
  wbEl('recommend').className = 'primary';
  wbShowView('request');
  wbChat = wbChatFresh();
  wbChat.phase = 'request';
  wbChat.instruction = '';
  wbChat.selectedSquadIds = [];
  wbChatAdd(
    'guide',
    '新しい目的を教えてください。今のGoalは、新しい計画案を作って置き換えを確認するまで保持します。',
  );
  wbChatCommit();
  wbNotice(
    '今のGoalは保持しています。新しい計画案を作る時に、置き換えを確認します。',
  );
  wbSimpleMode = 'home';
  wbSimpleRequest = '';
  wbEl('simple-request').value = '';
  wbEl('simple-goal').value = '';
  wbEl('simple-intent').value = '';
  wbEl('advanced-workbench').open = false;
  wbRenderSimple();
  wbEl('simple-request').focus();
});
wbOn('next-action', 'click', async () => {
  if (!wbNextAction) return;
  if (wbNextAction.copy) return wbCopy(renderGoalPrompt(wbGoal));
  if (wbNextAction.download) return wbSaveGoal();
  if (wbNextAction.view) return wbShowView(wbNextAction.view);
  if (wbNextAction.taskId) {
    wbSelectedTask = wbNextAction.taskId;
    wbEl('task-select').value = wbSelectedTask;
    wbEl('task-filter').value = 'all';
    wbClearResultForm();
    wbRenderTask();
    wbRenderTaskList();
  }
  if (wbNextAction.event) {
    wbEl('event-type').value = wbNextAction.event;
    wbRenderRecordFields();
    wbEl('record-section').open = true;
    wbEl('record-section').scrollIntoView({
      block: 'start',
      behavior: 'smooth',
    });
    wbEl('actor').focus();
  } else {
    wbEl('task-detail').scrollIntoView({ block: 'start', behavior: 'smooth' });
    wbEl('task-detail').focus();
  }
});
wbOn('save-unreadable', 'click', () =>
  wbDownload(
    wbUnreadableRaw,
    'amc-goal-unreadable-backup.txt',
    'text/plain;charset=utf-8',
  ),
);
wbOn('import-file', 'change', async (event) => {
  const file = event.target.files[0];
  if (!file) return;
  if (file.size > 16_000_000)
    throw new Error('Goal JSONは16MB以下にしてください。');
  const goal = wbValidate(JSON.parse(await file.text()));
  if (wbGoal?.id === goal.id && goal.revision < wbGoal.revision)
    throw new Error(
      '古いrevisionへの上書きを拒否しました。必要ならJSONを別途確認してください。',
    );
  if (
    !window.confirm(
      'JSONの内容は自己申告の記録です。現在のGoal表示をこの記録に置き換えますか？',
    )
  )
    return;
  wbCheckConcurrentSave();
  wbGoal = goal;
  wbSurface = 'request';
  wbSimpleMode = null;
  wbSelectedTask = '';
  wbEl('coverage').value = '';
  wbEl('goal-criteria').value = '';
  wbEl('record-section').open = false;
  wbView = goal.state === 'draft' ? 'plan' : 'progress';
  wbEl('parallel').value = String(goal.maxParallel);
  wbEl('task-filter').value = 'all';
  wbClearResultForm();
  wbPersist();
  wbRender();
  wbEl('instruction').value = goal.instruction;
  wbChoose(goal.selectedSquadIds ?? []);
  wbChat = wbChatFresh();
  wbChatAdd(
    'guide',
    '計画ファイルを読み込みました。会話はファイルに含まれないため、計画の状態から案内を再開します。\n\n' +
      wbChatProgressText(),
  );
  wbChatAdd('guide', wbChatPromptForPhase());
  wbChatCommit();
  wbNotice('Goalを読み込みました。正本AMCには反映していません。');
});
function wbChatReviewMessage() {
  return (
    '承認する内容をまとめました。\n\n目的：' +
    wbGoal.instruction +
    '\n\n今回の範囲・対象外：\n' +
    wbChat.coverage +
    '\n\n完成の基準：\n' +
    wbChat.criteria +
    '\n\n計画に含まれる作業も詳細で確認してください。目的に合わないものがあれば承認しないでください。\n承認は計画の記録だけです。AI起動・課金・公開・実機操作の許可ではありません。'
  );
}
function wbChatAssertDraft() {
  if (
    !wbGoal ||
    wbGoal.state !== 'draft' ||
    wbChat.goalId !== wbGoal.id ||
    wbChat.goalRevision !== wbGoal.revision
  )
    throw new Error(
      '計画の状態が変わっています。計画の詳細を確認してください。',
    );
}
function wbChatSubmit(event) {
  event?.preventDefault();
  if (wbChatComposing || event?.isComposing || event?.keyCode === 229) return;
  const value = wbEl('chat-input').value.trim();
  if (!value) return;
  if (value.length > 8000)
    throw new Error('1回のメッセージは8,000文字以内で送ってください。');
  wbChatAdd('user', value);
  if (['request', 'squads'].includes(wbChat.phase)) {
    wbEl('instruction').value = value;
    wbRecommend();
    wbChat.instruction = value;
    wbChat.selectedSquadIds = wbSelectedSquads();
    wbChat.phase = 'squads';
    wbChatAdd('guide', wbChatCandidates());
  } else if (['scope', 'criteria'].includes(wbChat.phase)) {
    wbChatAssertDraft();
    if (
      /^(はい|うん|了解|承認|開始|開始して|進めて|ok|yes)[。.!！\s]*$/i.test(
        value,
      )
    ) {
      wbChatAdd(
        'guide',
        '返事だけでは、範囲や完成の基準を決められません。具体的な内容を教えてください。\n' +
          wbChatPromptForPhase(),
      );
    } else if (wbChat.phase === 'scope') {
      wbChat.coverage = value;
      wbEl('coverage').value = value;
      wbChat.phase = 'criteria';
      wbChatAdd('guide', wbChatPromptForPhase());
    } else {
      wbChat.criteria = value;
      wbEl('goal-criteria').value = value;
      wbChat.phase = 'review';
      wbChatAdd('guide', wbChatReviewMessage());
    }
  } else if (wbChat.phase === 'review') {
    wbChatAdd(
      'guide',
      'メッセージだけでは承認しません。内容を直す場合は「範囲を直す」「完成の基準を直す」、確定する場合は専用の承認ボタンを使ってください。',
    );
  } else if (wbChat.phase === 'blocked') {
    wbChatAdd(
      'guide',
      '相談メモとして残しました。自由文を判断するAIは未接続です。不足の補完を依頼するか、計画の詳細を確認してください。承認や実行はしていません。',
    );
  } else {
    wbChatAdd(
      'guide',
      'メモを残しました。自由な質問に回答するAIは未接続です。作業の開始・停止・完了には変えていません。\n\n' +
        wbChatProgressText(),
    );
  }
  wbEl('chat-input').value = '';
  wbChatCommit();
  wbEl('chat-input').focus();
}
wbOn('chat-form', 'submit', wbChatSubmit);
wbOn('chat-input', 'compositionstart', () => {
  wbChatComposing = true;
});
wbOn('chat-input', 'compositionend', () => {
  wbChatComposing = false;
});
wbOn('chat-input', 'keydown', (event) => {
  if (
    event.key === 'Enter' &&
    (event.ctrlKey || event.metaKey) &&
    !event.shiftKey
  ) {
    event.preventDefault();
    if (!event.isComposing && event.keyCode !== 229 && !wbChatComposing)
      wbChatSubmit(event);
  }
});
wbOn('chat-actions', 'click', async (event) => {
  const button = event.target.closest('[data-chat-action]');
  if (!button) return;
  const action = button.getAttribute('data-chat-action');
  if (action === 'make-plan') {
    if (wbChat.phase !== 'squads') return;
    wbChatAdd('user', '選んだ部隊で計画案を作成する');
    if (wbCompilePlan()) {
      wbEl('inspector').open = false;
      wbEl('chat-input').focus();
    } else {
      wbChatAdd(
        'guide',
        '計画の置き換えを取り消しました。元のGoalは保持しています。',
      );
      wbChatCommit();
    }
  } else if (action === 'edit-squads') {
    wbShowView('request', false);
    wbEl('team-picker').hidden = false;
    wbEl('inspector').open = true;
    wbEl('squads').closest('details').open = true;
    wbEl('selection-summary').focus();
  } else if (action === 'approve') {
    if (wbChat.phase !== 'review') return;
    wbChatAssertDraft();
    if (wbGoal.tasks.some((task) => task.scopeReviewRequired))
      throw new Error('計画の補完が必要です。先に不足を確認してください。');
    const coverage = wbEl('coverage').value.trim();
    const criteria = wbEl('goal-criteria').value.trim();
    if (coverage !== wbChat.coverage || criteria !== wbChat.criteria) {
      wbChat.coverage = coverage;
      wbChat.criteria = criteria;
      wbChat.phase = !coverage ? 'scope' : !criteria ? 'criteria' : 'review';
      wbChatAdd(
        'guide',
        '詳細画面で内容が変更されています。まだ承認していません。\n\n' +
          (wbChat.phase === 'review'
            ? wbChatReviewMessage()
            : wbChatPromptForPhase()),
      );
      wbChatCommit();
      return;
    }
    wbEl('coverage').value = wbChat.coverage;
    wbEl('goal-criteria').value = wbChat.criteria;
    wbApprovePlan();
    wbEl('inspector').open = false;
    wbEl('chat-input').focus();
  } else if (action === 'edit-scope' || action === 'edit-criteria') {
    wbChatAssertDraft();
    wbChat.phase = action === 'edit-scope' ? 'scope' : 'criteria';
    wbChatAdd('guide', wbChatPromptForPhase());
    wbChatCommit();
    wbEl('chat-input').focus();
  } else if (action === 'show-plan' || action === 'show-progress') {
    wbShowView(action === 'show-plan' ? 'plan' : 'progress');
  } else if (action === 'copy-prompt') {
    if (wbGoal?.state !== 'active') return;
    await wbCopy(renderGoalPrompt(wbGoal));
    wbChatAdd('guide', wbEl('notice').textContent);
    wbChatCommit();
  } else if (action === 'repair') {
    await wbRepairPrompt();
    wbChatAdd('guide', wbEl('notice').textContent);
    wbChatCommit();
  } else if (action === 'save-goal') {
    wbSaveGoal();
  } else if (action === 'status') {
    wbChatAdd('user', 'いまの進捗を教えて');
    wbChatAdd('guide', wbChatProgressText());
    wbChatCommit();
  } else if (action === 'save-chat') {
    wbDownload(
      JSON.stringify(wbChat, null, 2),
      'amc-conversation.json',
      'application/json',
    );
    wbNotice(
      '会話の保存を要求しました。これは会話の控えで、Goalの復元用ファイルとは別です。',
    );
  } else if (action === 'save-chat-backup') {
    wbDownload(
      wbChatStoredRaw,
      'amc-conversation-unreadable.txt',
      'text/plain;charset=utf-8',
    );
  } else if (
    action === 'replace-chat' &&
    window.confirm(
      '読めなかった会話の保存内容を、今表示している会話で置き換えます。必要な内容は退避しましたか？',
    )
  ) {
    wbChatUnreadable = false;
    wbChatCommit();
  }
});
// The default experience is a brief, not a conversation-based settings form.
// Existing catalog management and ledger controls remain in the disclosure.
function wbSimpleRange(estimate) {
  return estimate.upperHours === 0 && estimate.unestimatedCount > 0
    ? '未算定'
    : estimate.lowerHours + '–' + estimate.upperHours + ' 人時';
}
function wbSimpleDefinition() {
  return buildRequestPlan({
    request: wbSimpleRequest,
    goal: wbEl('simple-goal').value,
    intent: wbEl('simple-intent').value,
    planId: 'preview',
    createdAt: null,
  });
}
function wbSimpleCompile(definition, id, createdAt = null) {
  const goal = compileGoal({
    instruction: definition.brief.goal,
    squadIds: definition.mission.squads.map((squad) => squad.id),
    mission: definition.mission,
    project: definition.project,
    goalId: id,
    createdAt,
    maxParallel: 1,
  });
  goal.requestBrief = definition.brief;
  goal.planningMethod = 'software_local_prototype_template';
  goal.scopeWarning =
    '依頼のGoalと意図に沿ったソフトウェア試作の共通7工程。既存AMCの製品taskは含まない。AIによる意味分解ではなく、要件・対象ファイル・試験条件・工数を最初の3工程で具体化する。範囲追加や重要な不明点は本人へ確認する。';
  return wbValidate(goal);
}
function wbSimplePreview() {
  // Intent is not guessed. A placeholder is used only to show the fixed template.
  const definition = buildRequestPlan({
    request: wbSimpleRequest,
    goal: wbEl('simple-goal').value,
    intent: wbEl('simple-intent').value.trim() || '（まだ入力されていません）',
    planId: 'preview',
    createdAt: null,
  });
  const plan = wbSimpleCompile(definition, 'preview');
  const effort = estimateGoalEffort(plan);
  wbEl('simple-plan-preview').innerHTML =
    '<p>4部隊 · 7作業 · 仮の作業量 ' +
    wbEscape(wbSimpleRange(effort)) +
    '。依頼の規模に関係なく置いた初期係数で、最終見積りではありません。</p>' +
    definition.mission.squads
      .map(
        (squad) =>
          '<h3>' +
          wbEscape(squad.name) +
          '</h3>' +
          wbList(
            definition.project.tasks
              .filter((task) => squad.nextTaskIds.includes(task.id))
              .map((task) => task.title),
          ),
      )
      .join('') +
    '<h3>完成の確認</h3>' +
    wbList(definition.acceptanceCriteria.map((item) => item.criterion));
}
function wbRenderSimple() {
  const board = wbSurface === 'board';
  wbEl('mission-board-view').hidden = !board;
  wbEl('advanced-workbench').hidden = board;
  wbEl('workbench-footer').hidden = board;
  wbEl('board-tab').setAttribute('aria-pressed', String(board));
  wbEl('request-tab').setAttribute('aria-pressed', String(!board));
  const mode = wbSimpleMode ?? (wbGoal ? 'progress' : 'home');
  for (const name of ['home', 'review', 'progress'])
    wbEl('simple-' + name).hidden = board || name !== mode;
  if (!wbGoal || mode !== 'progress') return;
  const summary = summarizeGoal(wbGoal);
  const effort = estimateGoalEffort(wbGoal);
  const allTasksDone = wbGoal.tasks.every((task) => task.status === 'done');
  wbEl('simple-goal-title').textContent = wbGoal.instruction;
  wbEl('simple-intent-label').textContent = wbGoal.requestBrief
    ? '意図：' + wbGoal.requestBrief.intent
    : '既存の計画を表示しています。範囲と条件は詳細から確認できます。';
  const state =
    wbGoal.state === 'accepted'
      ? 'Goal検収済み（保存された記録）'
      : wbGoal.state === 'paused'
        ? '記録は一時停止中'
        : wbGoal.state === 'draft'
          ? '計画の確認が必要です'
          : allTasksDone
            ? 'Goal全体の検収待ち'
            : summary.counts.running
              ? '作業中 ' + summary.counts.running + '件（手動の記録）'
              : summary.counts.submitted
                ? '成果の確認待ち ' + summary.counts.submitted + '件'
                : !summary.readyTaskIds.length
                  ? '進めるための確認待ち'
                  : 'AIへの引渡し待ち';
  wbEl('simple-progress-state').textContent = state;
  wbEl('simple-metrics').innerHTML =
    '<div><strong>' +
    wbGoal.squads.length +
    '</strong><span>担当部隊</span></div>' +
    '<div><strong>' +
    summary.leafCompleted +
    ' / ' +
    summary.leafTotal +
    '</strong><span>作業の検収済み</span></div>' +
    '<div><strong>' +
    wbEscape(wbSimpleRange(effort)) +
    '</strong><span>残作業の仮置き' +
    (effort.unestimatedCount
      ? ' · 未算定 ' + effort.unestimatedCount + '件を除く'
      : '') +
    '</span></div>';
  wbEl('simple-squads').innerHTML = wbGoal.squads
    .map((squad) => {
      const own = wbGoal.tasks.filter((task) => task.squadId === squad.id);
      const leaves = own.filter((task) => !task.childTaskIds.length);
      const estimated = effort.bySquad.find(
        (item) => item.squadId === squad.id,
      );
      return (
        '<article><h3>' +
        wbEscape(squad.name) +
        '</h3><p>' +
        wbEscape(squad.goal) +
        '</p><p>' +
        leaves.filter((task) => task.status === 'done').length +
        ' / ' +
        leaves.length +
        '件を検収済み · 残作業の仮置き ' +
        (estimated &&
        !(estimated.unestimatedCount && estimated.upperHours === 0)
          ? wbEscape(estimated.lowerHours + '–' + estimated.upperHours + '人時')
          : '未算定') +
        (estimated?.unestimatedCount
          ? '（未算定 ' + estimated.unestimatedCount + '件を除く）'
          : '') +
        '</p><details><summary>作業と進め方を見る</summary>' +
        own
          .map(
            (task) =>
              '<h4>' +
              wbEscape(task.title) +
              '</h4><p>' +
              wbEscape(wbNames[task.status]) +
              ' · ' +
              wbEscape(
                task.dependsOn.length
                  ? '前提：' + task.dependsOn.join(' → ')
                  : '最初に取りかかる作業',
              ) +
              '</p>' +
              wbList(task.steps.map((step) => step.action)) +
              '<p>完成の条件</p>' +
              wbList(task.acceptanceCriteria.map((item) => item.criterion)),
          )
          .join('') +
        '</details></article>'
      );
    })
    .join('');
  const attention = wbGoal.tasks.filter(
    (task) =>
      task.status !== 'done' &&
      (['blocked', 'failed', 'submitted'].includes(task.status) ||
        task.scopeReviewRequired ||
        task.holds.length ||
        task.executionEligibility === 'authority_required'),
  );
  const attentionText = attention.map(
    (task) =>
      task.title +
      '：' +
      (task.holds.length
        ? task.holds
            .map(
              (hold) => hold.reason + '／必要な判断：' + hold.releaseCondition,
            )
            .join('、')
        : task.blockReason ||
          (task.status === 'submitted'
            ? '成果を別の担当が確認してください。'
            : task.status === 'failed'
              ? '結果と原因を確認してから再開します。'
              : task.scopeReviewRequired
                ? '成果物・完成条件の具体化が必要です。'
                : '実行先と権限の確認が必要です。')),
  );
  wbEl('simple-attention').innerHTML =
    '<h3>あなたの判断が必要なこと</h3>' +
    (attentionText.length
      ? wbList(attentionText)
      : wbGoal.state === 'accepted'
        ? '<p>この記録では、すべての検収が終わっています。</p>'
        : allTasksDone
          ? '<p>作業の検収はそろいました。詳細からGoal全体の条件と証拠を確認して、最後の検収を記録してください。</p>'
          : wbGoal.state === 'paused'
            ? '<p>詳細から一時停止の理由と再開条件を確認してください。これは台帳の停止で、外部AIを停止する操作ではありません。</p>'
            : wbGoal.state === 'draft'
              ? '<p>詳細から計画の範囲と完成条件を確認してください。まだ承認されていません。</p>'
              : '<p>実作業を任せるAIが、まだ接続されていません。下のボタンで指示をコピーして、使うAIへ貼り付けられます。</p>') +
    '<p class="small">この欄は保存した記録から表示します。通知の自動送信は未接続です。</p>';
  wbEl('simple-handoff').hidden =
    wbGoal.state !== 'active' || allTasksDone || !summary.readyTaskIds.length;
  wbEl('simple-boundary').textContent =
    'AIへの自動送信・実作業・自動進捗取得は未接続です。' +
    ' 工数は実測ではない仮係数の人時（文書1–3、コード/試験2–6、既存証拠確認0.5–1.5、親検収0.5–1）。AIの所要時間・納期・料金ではありません。具体化後に再見積りします。' +
    (wbGoal.requestBrief
      ? ' この4部隊は今回の依頼専用の役割案で、正本AMCの32部隊は変更していません。'
      : '');
}
wbOn('simple-example', 'click', () => {
  wbEl('simple-request').value =
    'AMCを、指示するだけで部隊が動くツールにしたい';
  wbEl('simple-request').focus();
});
function wbSimpleRequestSubmit(event) {
  event.preventDefault();
  if (event.isComposing || wbSimpleComposing) return;
  const request = wbEl('simple-request').value.trim();
  const error = requestPlanSupport(request);
  if (error) throw new Error(error);
  wbSurface = 'request';
  wbSimpleRequest = request;
  wbEl('simple-goal').value = request;
  wbEl('simple-intent').value = '';
  wbSimplePreview();
  wbSimpleMode = 'review';
  wbEl('advanced-workbench').open = false;
  wbRenderSimple();
  wbNotice('Goalと意図の2つを確認してください。まだ記録は置き換えていません。');
  wbEl('simple-intent').focus();
}
wbOn('simple-request-form', 'submit', wbSimpleRequestSubmit);
wbOn('simple-request', 'compositionstart', () => {
  wbSimpleComposing = true;
});
wbOn('simple-request', 'compositionend', () => {
  wbSimpleComposing = false;
});
wbOn('simple-request', 'keydown', (event) => {
  if (
    event.key === 'Enter' &&
    (event.ctrlKey || event.metaKey) &&
    !event.shiftKey
  ) {
    event.preventDefault();
    if (!event.isComposing && event.keyCode !== 229 && !wbSimpleComposing)
      wbSimpleRequestSubmit(event);
  }
});
for (const id of ['simple-goal', 'simple-intent'])
  wbOn(id, 'input', () => {
    try {
      wbSimplePreview();
    } catch {
      wbEl('simple-plan-preview').textContent =
        'Goalと意図を入力すると、準備する内容を表示します。';
    }
  });
wbOn('simple-back', 'click', () => {
  wbSimpleMode = 'home';
  wbRenderSimple();
  wbEl('simple-request').focus();
});
wbOn('simple-confirm', 'click', () => {
  if (wbSimpleMode !== 'review') return;
  wbSimpleDefinition(); // Validate before asking to replace any saved record.
  if (
    (wbGoal || wbUnreadableRaw) &&
    !window.confirm(
      '保存中の計画を新しいGoalに置き換えます。残したい記録は先に「記録を保存」してください。続けますか？',
    )
  )
    return;
  wbCheckConcurrentSave();
  const id =
    'request-' +
    (globalThis.crypto?.randomUUID?.() ??
      Date.now() + '-' + Math.random().toString(36).slice(2));
  const createdAt = new Date().toISOString();
  const definition = buildRequestPlan({
    request: wbSimpleRequest,
    goal: wbEl('simple-goal').value,
    intent: wbEl('simple-intent').value,
    planId: id,
    createdAt,
  });
  let goal = wbSimpleCompile(definition, id, createdAt);
  goal = applyGoalEvent(goal, {
    type: 'approve_plan',
    id: id + '-approval',
    expectedRevision: 0,
    actor: 'local-owner',
    role: 'owner',
    at: createdAt,
    scopeConfirmed: true,
    coverageStatement: definition.coverage,
    acceptanceCriteria: definition.acceptanceCriteria,
  });
  wbGoal = wbValidate(goal);
  wbSelectedTask = '';
  wbUnreadableRaw = null;
  wbEl('save-unreadable').hidden = true;
  wbSimpleMode = null;
  wbView = 'progress';
  wbEl('instruction').value = wbGoal.instruction;
  wbEl('coverage').value = definition.coverage;
  wbEl('goal-criteria').value = definition.acceptanceCriteria
    .map((item) => item.criterion)
    .join('\n');
  wbEl('parallel').value = '1';
  wbEl('task-filter').value = 'all';
  wbPersist();
  wbRender();
  wbChat = wbChatFresh();
  wbChatAdd(
    'guide',
    'Goalと意図から、今回専用の役割と準備工程をまとめました。\n' +
      wbChatProgressText(),
  );
  wbChatCommit();
  wbEl('advanced-workbench').open = false;
  wbNotice(
    '部隊分け・作業順・仮の工数を準備しました。実作業はまだ始まっていません。',
  );
  wbEl('simple-progress').scrollIntoView({ block: 'start' });
});
wbOn('simple-handoff', 'click', () => {
  if (wbGoal?.state !== 'active') return;
  const estimate = estimateGoalEffort(wbGoal);
  return wbCopy(
    renderGoalPrompt(wbGoal) +
      '\n\n## 初期の仮工数\n' +
      wbSimpleRange(estimate) +
      '。' +
      estimate.basis +
      '\n' +
      estimate.warning,
  );
});
wbOn('simple-details', 'click', () => {
  wbShowView(wbGoal?.state === 'draft' ? 'plan' : 'progress');
});
try {
  const raw = localStorage.getItem(wbStorageKey);
  wbStoredRaw = raw;
  if (raw) {
    wbGoal = wbValidate(JSON.parse(raw));
    wbView = wbGoal.state === 'draft' ? 'plan' : 'progress';
    wbEl('parallel').value = String(wbGoal.maxParallel);
    wbEl('save-status').textContent = '保存したGoalを復元しました';
    wbEl('instruction').value = wbGoal.instruction;
    wbChoose(wbGoal.selectedSquadIds ?? []);
  }
} catch {
  wbUnreadableRaw = wbStoredRaw;
  wbEl('save-unreadable').hidden = !wbUnreadableRaw;
  wbEl('persistence').textContent =
    '保存状態を復元できません。元の内容を退避してから、新しい計画または保存済みGoal JSONへ置き換えられます。';
}
wbRender();
wbChatRestore();
