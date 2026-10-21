const builder = document.querySelector('#pro-build');
if (builder) {
  const presets = {
    value: { gpu: '5060ti', ram: '64', ssd: '2', chassis: 'studio' },
    performance: { gpu: '5090', ram: '128', ssd: '4', chassis: 'expanded' },
    compact: { gpu: 'gb10', ram: '128', ssd: '4', chassis: 'integrated' },
  };
  const state = { kit: 'value', ...presets.value };
  const kitButtons = [...builder.querySelectorAll('[data-kit]')];
  const optionButtons = [...builder.querySelectorAll('[data-gpu], [data-ram], [data-ssd], [data-chassis]')];
  const get = selector => builder.querySelector(selector);
  const allowed = { kit: new Set(['value', 'performance', 'compact']), gpu: new Set(['5060ti', '5090', 'gb10']), ram: new Set(['64', '128']), ssd: new Set(['2', '4']), chassis: new Set(['studio', 'expanded', 'integrated']) };
  const valid = input => input && Object.entries(allowed).every(([key, values]) => values.has(input[key]))
    && (input.kit === 'compact'
      ? input.gpu === 'gb10' && input.ram === '128' && input.ssd === '4' && input.chassis === 'integrated'
      : input.gpu !== 'gb10' && (input.gpu !== '5090' || input.chassis === 'expanded'));
  const savedState = (() => { try { return JSON.parse(localStorage.getItem('avocadoProConfig') || 'null'); } catch { return null; } })();
  const urlState = Object.fromEntries(Object.keys(allowed).map(key => [key, new URLSearchParams(location.search).get(key)]));
  if (valid(urlState)) Object.assign(state, urlState);
  else if (valid(savedState)) Object.assign(state, savedState);
  const assembly = get('[data-assembly]');
  const armStudy = get('[data-arm-study]');
  const saveStatus = get('[data-save-status]');
  const stageButtons = [...get('[data-assembly]').querySelectorAll('[data-assembly-step]')];
  const stageParts = [...get('[data-assembly]').querySelectorAll('[data-assembly-part]')];
  const stagePanels = [...get('[data-assembly]').querySelectorAll('[data-stage-panel]')];
  const visualLayers = [...assembly.querySelectorAll('[data-machine-layer]')];
  const machineFlash = assembly.querySelector('[data-machine-flash]');
  const watchButton = assembly.querySelector('[data-watch-build]');
  let playbackToken = 0;
  let demoPlaying = false;
  let demoVisible = 0;
  const quickFit = assembly.querySelector('[data-quick-fit]');
  const quickStage = assembly.querySelector('[data-quick-stage]');
  const quickPart = assembly.querySelector('[data-quick-part]');
  const stages = [
    { title: 'Chassis + power', description: 'Start with the enclosure and power path. The shell is a form study; the selected power supply path must be tested.', icon: '▣' },
    { title: 'Board + CPU', description: 'Lower the mini-ITX board onto the standoffs, then seat the AM5 processor. Firmware and actual clearance remain to be tested.', icon: '▦' },
    { title: 'Memory', description: 'Seat two DDR5 modules in the board slots. The exact 128GB kit needs board validation.', icon: '▥' },
    { title: 'Storage', description: 'Fit the M.2 drive near the processor. Heat spreading and recoverable storage still need testing.', icon: '▭' },
    { title: 'Graphics', description: 'Seat the NVIDIA card and allow for its connector and cable bend. The RTX 5090 path needs the expanded case.', icon: '◉' },
    { title: 'Cooling + lid', description: 'Complete the airflow path, inspect the cable route, and close the lid in this visual study.', icon: '✳' },
  ];
  const storedAssembly = (() => { try { return JSON.parse(localStorage.getItem('avocadoProAssembly') || 'null'); } catch { return null; } })();
  const hasUrlConfig = valid(urlState);
  const installed = Array.from({ length: stages.length }, (_, index) => !hasUrlConfig && storedAssembly?.configuration && valid(storedAssembly.configuration)
    && Object.keys(allowed).every(key => storedAssembly.configuration[key] === state[key]) && storedAssembly.steps?.[index] === true);
  let activeStep = Math.max(0, installed.indexOf(false));
  if (installed.every(Boolean)) activeStep = stages.length - 1;
  const selectedPart = step => {
    switch (step) {
      case 0: return state.gpu === '5090' ? ['Expanded Air · 1000W+ path', 'Large card and cable space still to verify'] : [`Corsair SF750 · ${state.chassis === 'expanded' ? 'Expanded Air' : 'Lian Li A4-H2O'}`, '750W SFX reference · case fit to test'];
      case 1: return ['ASUS B850-I + Ryzen 7 9700X', '170 mm mini-ITX · AM5 CPU'];
      case 2: return [state.ram === '64' ? 'Kingston FURY Beast · 64GB' : '128GB DDR5 candidate', state.ram === '64' ? '2 × 32GB reference' : 'Exact board-supported kit to verify'];
      case 3: return [`Samsung 990 PRO · ${state.ssd}TB`, 'M.2 2280 reference'];
      case 4: return state.gpu === '5090' ? ['NVIDIA RTX 5090 FE · 32GB', '304 mm reference · expanded case'] : ['ASUS Dual RTX 5060 Ti · 16GB', '229 mm reference · PCIe'];
      default: return ['Noctua NF-A12x25 PWM fans', '120 mm reference · airflow to verify'];
    }
  };
  function persistAssembly() {
    try { localStorage.setItem('avocadoProAssembly', JSON.stringify({ configuration: state, steps: installed })); } catch { /* Browsers may disable local storage. */ }
  }
  function renderAssembly() {
    const compact = state.kit === 'compact';
    assembly.hidden = compact;
    armStudy.hidden = !compact;
    if (compact) return;
    const complete = installed.every(Boolean);
    assembly.dataset.assemblyGpu = state.gpu;
    assembly.dataset.assemblyChassis = state.chassis;
    assembly.dataset.complete = String(complete);
    assembly.dataset.playing = String(demoPlaying);
    assembly.querySelector('[data-assembly-count]').textContent = `${installed.filter(Boolean).length} / 6 confirmed`;
    assembly.querySelector('[data-assembly-progress]').style.width = `${installed.filter(Boolean).length / stages.length * 100}%`;
    assembly.querySelector('[data-assembly-caption]').textContent = demoPlaying ? `Showing how six parts come together · ${demoVisible} / 6` : complete ? 'Your choices are confirmed. Tap any part to inspect or change it.' : `Selected: ${stages[activeStep].title}. Compare the options and confirm your choice.`;
    assembly.querySelector('[data-assembly-stage-index]').textContent = `${String(activeStep + 1).padStart(2, '0')} / 06`;
    assembly.querySelector('[data-assembly-stage-title]').textContent = stages[activeStep].title;
    assembly.querySelector('[data-assembly-stage-description]').textContent = stages[activeStep].description;
    assembly.querySelector('[data-assembly-tray-icon]').textContent = stages[activeStep].icon;
    const [part, meta] = selectedPart(activeStep);
    assembly.querySelector('[data-assembly-selected-part]').textContent = part;
    assembly.querySelector('[data-assembly-selected-meta]').textContent = meta;
    stageButtons.forEach((button, index) => {
      button.dataset.installed = String(installed[index]);
      if (index === activeStep) button.setAttribute('aria-current', 'step');
      else button.removeAttribute('aria-current');
      assembly.querySelector(`[data-stage-status="${index}"]`).textContent = installed[index] ? 'Confirmed ✓' : index === activeStep ? 'Ready to confirm' : 'Explore';
    });
    stageParts.forEach((partElement, index) => {
      partElement.classList.toggle('is-installed', installed[index]);
      partElement.classList.toggle('is-active', index === activeStep);
    });
    visualLayers.forEach((layer, index) => layer.classList.toggle('is-installed', demoPlaying && index < demoVisible));
    stagePanels.forEach((panel, index) => { panel.hidden = index !== activeStep; });
    const fit = assembly.querySelector('[data-assembly-fit]');
    fit.disabled = installed[activeStep];
    fit.textContent = installed[activeStep] ? 'Choice confirmed ✓' : 'Confirm this part →';
    assembly.querySelector('[data-assembly-next]').hidden = !installed[activeStep] || activeStep === stages.length - 1;
    assembly.querySelector('[data-assembly-complete]').hidden = !complete;
    quickStage.textContent = `${String(activeStep + 1).padStart(2, '0')} / 06 · ${stages[activeStep].title}`;
    quickPart.textContent = part;
    quickFit.textContent = complete ? 'Review' : installed[activeStep] ? 'Next part' : 'Confirm';
    watchButton.textContent = demoPlaying ? 'Ⅱ Pause' : '▶ See assembly';
    watchButton.setAttribute('aria-pressed', String(demoPlaying));
  }
  function stopPlayback() {
    if (!demoPlaying) return;
    playbackToken += 1;
    demoPlaying = false;
    demoVisible = 0;
    renderAssembly();
  }
  function fitActivePart() {
    if (state.kit === 'compact' || installed[activeStep]) return;
    const fittedStep = activeStep;
    installed[fittedStep] = true;
    persistAssembly();
    const next = Array.from({ length: stages.length }, (_, offset) => (fittedStep + 1 + offset) % stages.length)
      .find(index => !installed[index]);
    if (next !== undefined) activeStep = next;
    renderAssembly();
    const partElement = stageParts[fittedStep];
    partElement.classList.remove('just-fitted');
    void partElement.getBoundingClientRect();
    partElement.classList.add('just-fitted');
    const visualLayer = visualLayers[fittedStep];
    visualLayer.classList.remove('just-fitted');
    void visualLayer.getBoundingClientRect();
    visualLayer.classList.add('just-fitted');
    machineFlash.style.left = partElement.style.getPropertyValue('--x');
    machineFlash.style.top = partElement.style.getPropertyValue('--y');
    machineFlash.classList.remove('is-flashing');
    void machineFlash.getBoundingClientRect();
    machineFlash.classList.add('is-flashing');
    assembly.querySelector('[data-assembly-rule]').textContent = next === undefined
      ? 'All six choices confirmed. Review or share your configuration below.'
      : `${stages[fittedStep].title} confirmed. Next: ${stages[next].title}. Physical compatibility remains unverified.`;
  }
  function renderBuilder() {
    const compact = state.kit === 'compact';
    const max = state.gpu === '5090';
    const standard = state.gpu === '5060ti';
    kitButtons.forEach(button => button.setAttribute('aria-pressed', String(button.dataset.kit === state.kit)));
    optionButtons.forEach(button => {
      const type = button.dataset.gpu ? 'gpu' : button.dataset.ram ? 'ram' : button.dataset.ssd ? 'ssd' : 'chassis';
      button.disabled = compact || (type === 'chassis' && button.dataset.chassis === 'studio' && max);
      button.setAttribute('aria-pressed', String(!compact && button.dataset[type] === state[type]));
    });
    builder.classList.toggle('pro-builder-compact', compact);
    const standardValue = state.kit === 'value' && standard && state.ram === '64' && state.ssd === '2' && state.chassis === 'studio';
    const standardPerformance = state.kit === 'performance' && max && state.ram === '128' && state.ssd === '4' && state.chassis === 'expanded';
    get('[data-summary-name]').textContent = compact ? 'GB10 / Compact study' : standardPerformance ? 'Studio Max / Performance' : standardValue ? 'Studio / Value' : max ? 'Studio Max / Custom' : 'Studio / Custom';
    get('[data-summary-description]').textContent = compact ? 'Separate Arm platform study. Parts are integrated and cannot be exchanged in this x86 assembly desk.' : max ? 'A larger, higher-power enclosure concept for one 32GB GPU.' : 'A serviceable single-GPU x86 concept for local AI work.';
    get('[data-summary-platform]').textContent = compact ? 'Arm · NVIDIA GB10 reference architecture' : 'ASUS B850-I · Ryzen 7 9700X candidate';
    get('[data-summary-gpu]').textContent = compact ? 'GB10 integrated compute' : max ? 'NVIDIA RTX 5090 FE · 32GB' : 'ASUS Dual RTX 5060 Ti · 16GB';
    get('[data-summary-ram]').textContent = compact ? '128GB unified memory' : state.ram === '64' ? 'Kingston FURY Beast · 2 × 32GB' : '128GB DDR5 · exact kit TBD';
    get('[data-summary-ssd]').textContent = compact ? `${state.ssd}TB NVMe reference` : `Samsung 990 PRO · ${state.ssd}TB`;
    get('[data-summary-chassis]').textContent = compact ? '240W reference · OEM enclosure to verify' : max ? '1000W+ PSU TBD · Expanded Air study' : state.chassis === 'expanded' ? 'Corsair SF750 · Expanded Air study' : 'Corsair SF750 · Lian Li A4-H2O silver candidate';
    const image = get('[data-summary-image]');
    image.src = compact ? '/images/avocado-pro-compact-study.webp' : max ? '/images/avocado-pro-performance-study.webp' : '/images/avocado-pro-value-study.webp';
    image.alt = compact ? 'Compact form study, not a confirmed GB10 enclosure' : max ? 'Expanded performance case form study' : 'Value case form study';
    get('[data-summary-form]').textContent = compact ? 'FORM STUDY / ARM PLATFORM' : max ? 'FORM STUDY / EXPANDED x86' : 'FORM STUDY / COMPACT x86';
    get('[data-compatibility]').textContent = compact ? 'Different Arm platform. OEM access, software compatibility, supply, and cost are unverified.' : max ? 'RTX 5090 FE is 304 mm long and requires a 1000W system supply. This expanded enclosure and its cable path are untested.' : standardValue ? 'Real product references, not a tested assembly. Board firmware, card fit, cooling, drivers, and price still need validation.' : 'Custom x86 concept. Board support, cooling, drivers, and exact component compatibility still need validation.';
    get('[data-interest-configuration]').textContent = get('[data-summary-name]').textContent;
    renderAssembly();
    saveStatus.textContent = '';
  }
  kitButtons.forEach(button => button.addEventListener('click', () => {
    stopPlayback();
    if (state.kit !== button.dataset.kit) installed.fill(false);
    state.kit = button.dataset.kit;
    Object.assign(state, presets[state.kit]);
    activeStep = 0;
    persistAssembly();
    renderBuilder();
  }));
  get('[data-return-x86]').addEventListener('click', () => {
    state.kit = 'value';
    Object.assign(state, presets.value);
    installed.fill(false);
    activeStep = 0;
    persistAssembly();
    renderBuilder();
    assembly.scrollIntoView({ behavior: 'smooth', block: 'start' });
  });
  optionButtons.forEach(button => button.addEventListener('click', () => {
    stopPlayback();
    if (state.kit === 'compact') return;
    const type = button.dataset.gpu ? 'gpu' : button.dataset.ram ? 'ram' : button.dataset.ssd ? 'ssd' : 'chassis';
    if (state[type] === button.dataset[type]) return;
    const previousChassis = state.chassis;
    state[type] = button.dataset[type];
    if (type === 'gpu') state.kit = state.gpu === '5090' ? 'performance' : 'value';
    if (state.gpu === '5090') state.chassis = 'expanded';
    const step = ({ chassis: 0, ram: 2, ssd: 3, gpu: 4 })[type];
    installed[step] = false;
    if (state.chassis !== previousChassis) installed[0] = false;
    activeStep = step;
    persistAssembly();
    renderBuilder();
    assembly.querySelector('[data-assembly-rule]').textContent = 'Choice changed. Confirm this part to continue.';
  }));
  stageButtons.forEach(button => button.addEventListener('click', () => {
    stopPlayback();
    activeStep = Number(button.dataset.assemblyStep);
    renderAssembly();
    assembly.querySelector('[data-assembly-rule]').textContent = installed[activeStep] ? 'Choice confirmed. Select a different option to change it.' : 'Compare the options, then confirm this part.';
  }));
  stageParts.forEach(part => {
    const choose = () => { stopPlayback(); activeStep = Number(part.dataset.assemblyPart); renderAssembly(); };
    part.addEventListener('click', choose);
    part.addEventListener('keydown', event => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); choose(); } });
  });
  const machineCanvas = assembly.querySelector('[data-machine-canvas]');
  assembly.querySelectorAll('[data-machine-view]').forEach(button => button.addEventListener('click', () => {
    stopPlayback();
    machineCanvas.dataset.view = button.dataset.machineView;
    assembly.querySelectorAll('[data-machine-view]').forEach(option => option.setAttribute('aria-pressed', String(option === button)));
  }));
  const manualFit = () => { stopPlayback(); fitActivePart(); };
  assembly.querySelector('[data-assembly-fit]').addEventListener('click', manualFit);
  quickFit.addEventListener('click', () => {
    stopPlayback();
    if (installed.every(Boolean)) { get('#pro-configuration').scrollIntoView({ behavior: 'smooth', block: 'start' }); return; }
    if (installed[activeStep]) {
      activeStep = installed.findIndex(fitted => !fitted);
      renderAssembly();
      return;
    }
    fitActivePart();
  });
  assembly.querySelector('[data-quick-details]').addEventListener('click', () => {
    stopPlayback();
    assembly.querySelector('.pro-assembly-inspector').scrollIntoView({ behavior: 'smooth', block: 'start' });
  });
  if ('IntersectionObserver' in window) {
    new IntersectionObserver(entries => { assembly.dataset.dockVisible = String(entries[0].isIntersecting); }, { threshold: 0.01 }).observe(assembly.querySelector('.pro-assembly-scene'));
  } else assembly.dataset.dockVisible = 'true';

  assembly.querySelector('[data-assembly-next]').addEventListener('click', () => {
    stopPlayback();
    activeStep = Math.min(stages.length - 1, activeStep + 1);
    renderAssembly();
    assembly.querySelector('[data-assembly-rule]').textContent = 'Compare the options, then confirm this part.';
  });
  assembly.querySelector('[data-assembly-reset]').addEventListener('click', () => {
    stopPlayback();
    installed.fill(false);
    activeStep = 0;
    persistAssembly();
    renderAssembly();
    assembly.querySelector('[data-assembly-rule]').textContent = 'Choices cleared. Tap any part to confirm it again.';
  });
  watchButton.addEventListener('click', async () => {
    if (demoPlaying) { stopPlayback(); return; }
    machineCanvas.dataset.view = 'inside';
    assembly.querySelectorAll('[data-machine-view]').forEach(option => option.setAttribute('aria-pressed', String(option.dataset.machineView === 'inside')));
    demoPlaying = true;
    demoVisible = 0;
    const token = ++playbackToken;
    renderAssembly();
    const delay = window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 100 : 850;
    while (token === playbackToken && demoVisible < stages.length) {
      await new Promise(resolve => window.setTimeout(resolve, delay));
      if (token !== playbackToken) break;
      demoVisible += 1;
      renderAssembly();
    }
    if (token === playbackToken) {
      demoPlaying = false;
      demoVisible = 0;
      renderAssembly();
    }
  });
  get('[data-save-spec]').addEventListener('click', () => {
    try {
      localStorage.setItem('avocadoProConfig', JSON.stringify(state));
      saveStatus.textContent = 'Saved in this browser. Use the shareable link to open it elsewhere.';
    } catch { saveStatus.textContent = 'Browser storage is unavailable. Copy the shareable link instead.'; }
  });
  get('[data-copy-spec]').addEventListener('click', async event => {
    const link = new URL('https://avocadopro.si/');
    for (const key of Object.keys(allowed)) link.searchParams.set(key, state[key]);
    link.hash = 'pro-customize';
    try {
      await navigator.clipboard.writeText(link.href);
      event.currentTarget.firstChild.textContent = 'Link copied ';
    } catch {
      event.currentTarget.firstChild.textContent = 'Copy unavailable here ';
    }
  });
  const interestForm = get('[data-pro-interest-form]');
  const interestStatus = get('[data-interest-status]');
  const interestSubmit = get('[data-interest-submit]');
  const receiptPanel = get('[data-interest-receipt]');
  let consentVersion = null;
  function showReceipt(receipt) {
    interestForm.hidden = true;
    receiptPanel.hidden = false;
    get('[data-receipt-id]').textContent = receipt.id;
    get('[data-receipt-code]').textContent = receipt.removalCode;
  }
  try {
    const previousReceipt = JSON.parse(localStorage.getItem('avocadoProInterestReceipt') || 'null');
    if (previousReceipt?.id && previousReceipt?.removalCode) showReceipt(previousReceipt);
  } catch { /* Browser storage may be disabled. */ }
  fetch('/api/pro-interest/availability', { cache: 'no-store' })
    .then(response => response.ok ? response.json() : { open: false })
    .then(result => {
      if (!result.open || !result.consentVersion) throw new Error('closed');
      consentVersion = result.consentVersion;
      interestSubmit.disabled = false;
      interestStatus.textContent = 'First-build interest is open. No payment will be taken.';
    })
    .catch(() => { interestStatus.textContent = 'Requests are temporarily unavailable. Your configuration can still be saved or shared.'; });
  interestForm.addEventListener('submit', async event => {
    event.preventDefault();
    if (!consentVersion) return;
    interestSubmit.disabled = true;
    interestStatus.textContent = 'Sending your request…';
    const fields = new FormData(interestForm);
    try {
      const response = await fetch('/api/pro-interest/submissions', {
        method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ email: fields.get('email'), region: fields.get('region'), note: fields.get('note'), website: fields.get('website'), configuration: { ...state }, contactConsent: fields.get('contactConsent') === 'on', consentVersion }),
      });
      const result = await response.json();
      if (!response.ok || !result.id || !result.removalCode) throw new Error(result.error || 'unavailable');
      try { localStorage.setItem('avocadoProInterestReceipt', JSON.stringify(result)); } catch { /* Receipt remains visible for manual saving. */ }
      showReceipt(result);
    } catch {
      interestStatus.textContent = 'The request could not be received. Please try again later.';
      interestSubmit.disabled = false;
    }
  });
  get('[data-remove-interest]').addEventListener('click', async event => {
    const id = get('[data-receipt-id]').textContent;
    const removalCode = get('[data-receipt-code]').textContent;
    event.currentTarget.disabled = true;
    get('[data-remove-status]').textContent = 'Removing your request…';
    try {
      const response = await fetch('/api/pro-interest/submissions', { method: 'DELETE', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ id, removalCode }) });
      const result = await response.json();
      if (!response.ok || !result.removed) throw new Error('not removed');
      localStorage.removeItem('avocadoProInterestReceipt');
      receiptPanel.hidden = true;
      interestForm.hidden = false;
      interestForm.reset();
      interestStatus.textContent = 'Request removed. You can send a new one.';
      interestSubmit.disabled = !consentVersion;
    } catch {
      get('[data-remove-status]').textContent = 'Removal did not complete. Keep your receipt and try again.';
      event.currentTarget.disabled = false;
    }
  });
  renderBuilder();
}
