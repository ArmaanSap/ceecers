/**
 * MARVIN Conditions & Abort module v1.0
 * Drop-in, non-destructive UI for the existing Jezero mission planner.
 * No live conditions are fetched. Curiosity RAD dose rate is historical Gale context.
 * Demonstration states are simulation-only and are never operational clearance.
 * License: MIT (module only).
 */
(function (w, d) {
  "use strict";
  if (w.MarswalkConditions) return;
  const script = d.currentScript;
  const base = script && script.src ? script.src.slice(0, script.src.lastIndexOf('/') + 1) : './';
  const css = d.createElement('link');
  css.rel = 'stylesheet'; css.href = base + 'marswalk-conditions.css';
  d.head.appendChild(css);

  const NASA = Object.freeze({
    rad: 'https://www.nasa.gov/news-release/nasa-rover-results-include-first-age-measurement-on-mars-and-help-for-human-exploration/',
    meda: 'https://pdsatmospheres.nmsu.edu/data_and_services/atmospheres_data/PERSEVERANCE/meda.html',
    medaExplain: 'https://science.nasa.gov/resource/medas-radiation-and-dust-sensor/',
    marci: 'https://science.nasa.gov/mission/mars-reconnaissance-orbiter/science-instruments/',
    pds: 'https://pdsatmospheres.nmsu.edu/data_and_services/atmospheres_data/Mars/Mars.html',
    shield: 'https://www.nasa.gov/science-research/heliophysics/real-martians-how-to-protect-astronauts-from-space-radiation-on-mars/',
    dust: 'https://www.nasa.gov/solar-system/the-fact-and-fiction-of-martian-dust-storms/',
    stormStudy: 'https://agupubs.onlinelibrary.wiley.com/doi/10.1029/2022JE007559',
    stormReport: 'https://pmc.ncbi.nlm.nih.gov/articles/PMC9540647/'
  });
  // In-situ average measured at Gale Crater 2012-2013: NOT live Jezero and NOT a suit dose prediction.
  const GALE_RAD_MSV_DAY = 0.67;
  // Mastcam-Z/MEDA-supported Jezero values published in JGR Planets (not current forecasts).
  // These data are reported as optical-depth means for the stated sol window.
  const JEZERO_DUST_HISTORY = Object.freeze([
    {phase:'Before',sols:'Sols 300–311',tau:0.28,uncertainty:0.07},
    {phase:'Peak',sols:'Sol 316',tau:1.40,uncertainty:0.04},
    {phase:'After',sols:'Sols 319–322',tau:0.44,uncertainty:0.04}
  ]);
  const scenarios = {
    unknown: {name:'No current data', data:null},
    clear: {name:'Clear-sky drill', data:{tau:0.45,windMps:6,solarEvent:'none',scenario:'clear'}},
    dusty: {name:'Rising dust drill', data:{tau:1.4,windMps:12,solarEvent:'none',scenario:'dusty'}},
    storm: {name:'Severe dust drill', data:{tau:3.8,windMps:18,solarEvent:'none',scenario:'storm'}},
    solar: {name:'Solar event drill', data:{tau:0.7,windMps:7,solarEvent:'event',scenario:'solar'}}
  };
  let state = {
    scenario:'unknown', tab:'overview', open:false, source:'none', conditions:null, observedAt:null,
    mission:null, requested:false, checkboxes:{}, manual:false
  };
  const host = d.createElement('div');host.id='marswalk-conditions-root';
  host.setAttribute('aria-label','MARVIN mission conditions');
  d.body.appendChild(host);
  const $ = (sel) => host.querySelector(sel);
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const num = (v) => (typeof v === 'number' && isFinite(v) && v >= 0) ? v : null;
  const fmt = (v, digits=0) => v === null || v === undefined ? '—' : Number(v).toFixed(digits);
  const dateLabel = (s) => {
    if (!s) return 'No dated observation';
    const ts = Date.parse(s);
    return isFinite(ts) ? new Date(ts).toISOString().slice(0,10) + ' UTC' : 'Unverified date';
  };
  const ageHours = (s) => {const ms=Date.parse(s);return isFinite(ms) ? Math.max(0,(Date.now()-ms)/3600000) : null;};
  const modeName = () => state.source === 'simulated' ? 'SIMULATED SCENARIO' : (state.source === 'archived' ? 'ARCHIVED OBSERVATION' : (state.source === 'connected' ? 'EXTERNAL FEED · VERIFY AGE' : 'NO LIVE CONDITIONS'));
  const cleanMission = (p) => {
    if (!p || typeof p !== 'object') return null;
    const mission = {
      name: String(p.name || p.missionName || 'Jezero EVA'),
      durationMin: num(p.durationMin ?? p.missionDurationMinutes ?? p.totalMinutes),
      elapsedMin: num(p.elapsedMin ?? p.elapsedMinutes ?? 0),
      returnMin: num(p.returnMin ?? p.remainingReturnMinutes ?? p.plannedReturnMinutes),
      reserveFraction: typeof p.reserveFraction === 'number' && p.reserveFraction >= 0 && p.reserveFraction < 1 ? p.reserveFraction : 0.2,
      distanceKm: num(p.distanceKm),
      stopName: String(p.stopName || p.currentStop || 'Current route position'),
      routeId: String(p.routeId || ''),
      atBase: !!p.atBase
    };
    return mission;
  };
  function assess() {
    const c = state.conditions;
    const m = state.mission;
    const noSensor = !c;
    const age = ageHours(state.observedAt);
    const stale = state.source !== 'simulated' && (age === null || age > 72);
    let level='unknown', causes=[];
    if (noSensor) causes.push('No current Jezero atmospheric measurements or solar-event forecast connected.');
    if (stale && !noSensor) causes.push('Observation is undated or older than 72 h (demo freshness guardrail).');
    if (c) {
      if (c.solarEvent === 'event') {level='hold';causes.push('Simulated/observed solar energetic particle alert: seek radiation shelter.');}
      else if (c.solarEvent === 'warning') {level='hold';causes.push('Solar particle warning: stop discretionary EVA tasks.');}
      if (c.tau !== null) {
        if (c.tau >= 2.0) {level='hold';causes.push('Dust optical depth is at or above the illustrative HOLD band (τ ≥ 2).');}
        else if (c.tau >= 0.8 && level !== 'hold') {level='watch';causes.push('Elevated dust opacity: visibility and power systems need review.');}
        else if (level === 'unknown') level='clear';
      }
      if (!c.solarEvent || c.solarEvent === 'unknown') {
        causes.push('Solar particle monitoring is unavailable; no operational clearance.');
        if (level === 'clear') level='unknown';
      }
    }
    if (stale && level !== 'hold') level='unknown';
    if (noSensor) level='unknown';
    const budget = m && m.durationMin !== null && m.returnMin !== null ? {
      remainingMin: Math.max(0,m.durationMin-(m.elapsedMin||0)),
      reserveMin: m.durationMin*m.reserveFraction,
      returnMin: m.returnMin,
      marginMin: m.durationMin-(m.elapsedMin||0)-m.returnMin-m.durationMin*m.reserveFraction
    } : null;
    if (budget && budget.marginMin < 0) {level='hold';causes.push('Remaining time cannot cover return plus protected time reserve.');}
    const radReference = m && m.durationMin !== null ? GALE_RAD_MSV_DAY * m.durationMin / 1440 : null;
    const short = level === 'hold' ? 'ABORT / HOLD' : (level === 'watch' ? 'ELEVATED RISK' : (level === 'clear' ? 'DRILL: CLEAR' : 'DATA HOLD'));
    return {level, short, causes, budget, radReference, observationAgeHours:age, stale, operationalClearance:false};
  }
  const svgIcon = (kind) => {
    const paths={
      shield:'<path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>',
      sun:'<circle cx="12" cy="12" r="4"/><path d="M12 2v2m0 16v2m4.93-17.07-1.42 1.42M6.49 17.51l-1.42 1.42M22 12h-2M4 12H2m16.93 6.93-1.42-1.42M6.49 6.49 5.07 5.07"/>',
      wind:'<path d="M3 8h12a3 3 0 1 0-3-3M2 12h18a3 3 0 1 1-3 3M3 16h8a3 3 0 1 1-3 3"/>',
      clock:'<circle cx="12" cy="12" r="10"/><path d="M12 6v6l4 2"/>',
      alert:'<path d="m10.3 3.9-8.2 14.2A2 2 0 0 0 3.9 21h16.2a2 2 0 0 0 1.8-2.9L13.7 3.9a2 2 0 0 0-3.4 0Z"/><path d="M12 9v4m0 4h.01"/>',
      chevron:'<path d="m9 18 6-6-6-6"/>',
      check:'<path d="m20 6-11 11-5-5"/>',
      pin:'<path d="M20 10c0 5-8 12-8 12S4 15 4 10a8 8 0 1 1 16 0Z"/><circle cx="12" cy="10" r="2"/>'
    };
    return `<svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${paths[kind]||paths.shield}</svg>`;
  };
  const card=(icon,title,value,sub,klass='')=>`<div class="mc-metric ${klass}"><div class="mc-metric-top">${svgIcon(icon)}<span>${esc(title)}</span></div><div class="mc-metric-value">${value}</div><div class="mc-metric-sub">${sub}</div></div>`;
  function stateLabel() {
    if (state.source==='simulated') return `${scenarios[state.scenario]?.name||'Drill'} · never flight-ready`;
    if (state.source==='archived') return `Archived · ${dateLabel(state.observedAt)}`;
    if (state.source==='connected') return `External data · ${dateLabel(state.observedAt)}`;
    return 'No active local telemetry or current forecast';
  }
  function renderOverview(a) {
    const c=state.conditions;
    const budget=a.budget;
    const tau=c?.tau===null || !c ? '—' : `${fmt(c.tau,2)} <small>τ</small>`;
    const wind=c?.windMps===null || !c ? '—' : `${fmt(c.windMps,1)} <small>m/s</small>`;
    const sAlert= !c || c.solarEvent==='unknown' ? 'UNKNOWN' : c.solarEvent==='event' ? 'EVENT DRILL' : c.solarEvent==='warning' ? 'WARNING' : 'NO ALERT (DRILL)';
    return `
      <div class="mc-labnote">${svgIcon('alert')} <div><strong>Prototype / ${modeName()}</strong><span>${esc(stateLabel())}. The app cannot issue real EVA authorization.</span></div></div>
      <div class="mc-section-label">ENVIRONMENT · JEZERO CONTEXT</div>
      <div class="mc-metrics">
        ${card('wind','Dust opacity',tau,c ? 'Illustrative alert bands (not NASA EVA limits)' : 'No Jezero optical-depth data loaded')}
        ${card('wind','Surface wind',wind,c ? 'Scenario or source-reported measurement' : 'No local observation loaded')}
        ${card('sun','Solar particle status',esc(sAlert), 'Solar storms differ from dust storms','mc-metric-wide')}
        ${card('shield','Radiation reference','0.67 <small>mSv/day</small>', 'Curiosity RAD · Gale Crater · 2012–2013','mc-metric-wide')}
      </div>
      <div class="mc-section-label">REAL JEZERO RECORD · JANUARY 2022 DUST STORM</div>
      <div class="mc-history">${JEZERO_DUST_HISTORY.map(x=>`<div class="mc-historical"><div><strong>${x.phase}</strong><small>${x.sols}</small></div><div class="mc-bar"><i style="width:${Math.min(100,Math.round(x.tau/1.5*100))}%"></i></div><b>τ ${fmt(x.tau,2)} ± ${fmt(x.uncertainty,2)}</b></div>`).join('')}
      <p>Published visible optical depths at Jezero. The 5–11 Jan 2022 storm produced winds up to ~20 m/s in the observation period. <a href="${NASA.stormStudy}" target="_blank" rel="noopener noreferrer">Published measurements ↗</a> · <a href="${NASA.stormReport}" target="_blank" rel="noopener noreferrer">Storm study ↗</a> <strong>ARCHIVED, NOT CURRENT.</strong></p></div>
      <div class="mc-section-label">ROUTE RETURN & EXPOSURE</div>
      <div class="mc-budget">
        <div class="mc-budgetline"><span>Mission budget</span><b>${fmt(state.mission?.durationMin)} min</b></div>
        <div class="mc-budgetline"><span>Time remaining</span><b>${fmt(budget?.remainingMin)} min</b></div>
        <div class="mc-budgetline"><span>Return to base estimate</span><b>${fmt(budget?.returnMin)} min</b></div>
        <div class="mc-budgetline"><span>Protected reserve (${Math.round((state.mission?.reserveFraction ?? 0.2)*100)}%)</span><b>${fmt(budget?.reserveMin)} min</b></div>
        <div class="mc-budgetline mc-budget-total"><span>Time margin after safe return + reserve</span><b class="${budget && budget.marginMin<0?'mc-red':''}">${budget?fmt(budget.marginMin):'—'} min</b></div>
      </div>
      <p class="mc-fine">Gale RAD historical background × planned duration = <strong>${a.radReference===null?'—':fmt(a.radReference,3)+' mSv'}</strong>. This is only a arithmetic reference, <strong>not</strong> a forecast of astronaut dose, suit shielding, solar storm exposure, or crew risk.</p>
      <div class="mc-controls"><label>DRILL MODE <select data-field="scenario" aria-label="Example hazard scenario">
        <option value="unknown" ${state.scenario==='unknown'?'selected':''}>No current data (default)</option>
        <option value="clear" ${state.scenario==='clear'?'selected':''}>Clear conditions · simulated</option>
        <option value="dusty" ${state.scenario==='dusty'?'selected':''}>Rising dust · simulated</option>
        <option value="storm" ${state.scenario==='storm'?'selected':''}>Severe dust storm · simulated</option>
        <option value="solar" ${state.scenario==='solar'?'selected':''}>Solar particle event · simulated</option>
      </select></label><button class="mc-minor" data-action="edit-route">${state.manual?'Hide':'Enter'} route times</button></div>
      ${state.manual?`<div class="mc-times"><label>Mission total (min)<input data-field="duration" type="number" min="0" value="${state.mission?.durationMin??''}" placeholder="e.g. 180"></label><label>Elapsed (min)<input data-field="elapsed" type="number" min="0" value="${state.mission?.elapsedMin??''}" placeholder="e.g. 40"></label><label>Return ETA (min)<input data-field="return" type="number" min="0" value="${state.mission?.returnMin??''}" placeholder="e.g. 55"></label><button class="mc-secondary mc-fill" data-action="apply-route">Update planning budget</button><p class="mc-fine">Manual entries are planning inputs, not measured rover travel times.</p></div>`:''}
      <div class="mc-section-label">MISSION ASSESSMENT</div><ul class="mc-reasons">${a.causes.length ? a.causes.map(x=>`<li>${esc(x)}</li>`).join('') : '<li>Only an illustrative drill state is evaluated; verify actual conditions before any mission.</li>'}</ul>
    `;
  }
  const actions = [
    {id:'stop',title:'Halt discretionary science tasks',detail:'Stop sampling and document current location, mission clock, and crew condition.'},
    {id:'comms',title:'Contact mission control and partner',detail:'Report hazard, dose-rate/solar warning if available, dust trend and remaining life-support margins.'},
    {id:'return',title:'Activate prevalidated return route',detail:'Follow recorded route and confirmed waypoints. Do not substitute an unverified shortcut.'},
    {id:'shelter',title:'Enter rated radiation shelter if solar alert',detail:'Use a designated shielded habitat/vehicle shelter (e.g., water/polyethylene shielding as engineered). An EVA suit is not an adequate storm shelter.'},
    {id:'dust',title:'Apply dust protection and ingress protocol',detail:'Protect visor/optics and suit interfaces, avoid dispersive tasks, manage solar-power contingency, and complete dust isolation on reentry.'},
    {id:'verify',title:'Reconcile crew and systems',detail:'Check crew, life support, comms, power, dust filtration, and dosimetry; do not resume without review.'}
  ];
  function renderActions(a) {
    const radiation=state.conditions?.solarEvent === 'event' || state.conditions?.solarEvent==='warning';
    const dust=state.conditions?.tau!==null && state.conditions?.tau>=2;
    return `<div class="mc-section-label">PRIMARY CONTINGENCY / ABORT PROCEDURE</div>
      <div class="mc-protocol"><b>${radiation?'SOLAR PARTICLE RESPONSE':dust?'DUST STORM RESPONSE':'STANDARD RETURN / UNVERIFIED CONDITIONS'}</b><p>${radiation?'Prioritize reaching a pre-designated radiation storm shelter. The historical RAD average cannot predict the severity of a solar particle event.':dust?'Treat reduced visibility, optical contamination, and power loss as primary dust risks. Mars winds exert far less force than Earth winds.':'Do not continue a real EVA without verified environmental data, life-support margins, comms coverage, and an accessible return path.'}</p></div>
      <div class="mc-checklist">${actions.map((x,i)=>`<label class="mc-task"><input type="checkbox" data-check="${x.id}" ${state.checkboxes[x.id]?'checked':''}><span class="mc-tasknum">${String(i+1).padStart(2,'0')}</span><span><strong>${esc(x.title)}</strong><small>${esc(x.detail)}</small></span></label>`).join('')}</div>
      <div class="mc-returnbox"><div class="mc-budgetline"><span>Calculated time margin</span><b>${a.budget?fmt(a.budget.marginMin):'—'} min</b></div><div class="mc-budgetline"><span>Route position</span><b>${esc(state.mission?.stopName||'Not connected')}</b></div><button class="mc-return" data-action="abort">${svgIcon('pin')} REQUEST RETURN TO BASE ${svgIcon('chevron')}</button>
      <p class="mc-fine">The button sends a <code>marswalk:abort-request</code> event to the host planner. It does not invent a path, move the simulated crew, or claim that the return route has been activated.</p>
      ${state.requested?'<div class="mc-requested">RETURN REQUEST SENT · Awaiting host route acknowledgement</div>':''}</div>`;
  }
  function renderSources() {
    const items=[
      ['Curiosity · RAD','Historical Mars ionizing radiation dose equivalent at Gale Crater; published ~0.67 mSv/day (Aug 2012–Jun 2013)',NASA.rad],
      ['Perseverance · MEDA / PDS','Wind, pressure, temperatures, solar irradiance and dust opacity; historical Jezero measurements; no current reading loaded here',NASA.meda],
      ['MEDA RDS explained','Despite its name, MEDA Radiation and Dust Sensor measures sunlight and airborne dust, not astronaut ionizing-radiation dose',NASA.medaExplain],
      ['MRO · MARCI','Orbital daily global imaging supports dust tracking at broad scales; not a real-time on-route weather forecast',NASA.marci],
      ['MRO · MCS / PDS','Archived atmospheric temperature and dust-aerosol profiles',NASA.pds],
      ['Jezero Jan 2022 dust event','Research-grade measured optical depths before, at peak, and after storm; winds up to 20 m/s were observed',NASA.stormStudy],
      ['NASA radiation protection','Shielded habitats, storm shelters and rapid EVA termination for solar particle alerts',NASA.shield],
      ['NASA Mars dust-storm physics','Dust optical obscuration, environmental risks and weak wind force in thin atmosphere',NASA.dust]
    ];
    return `<div class="mc-section-label">NASA / PDS SOURCES</div><p class="mc-fine">Every observation requires an instrument, location, value, timestamp and method. No archive automatically becomes a live forecast.</p><div class="mc-sources">${items.map(x=>`<a href="${x[2]}" target="_blank" rel="noopener noreferrer"><b>${esc(x[0])} ↗</b><small>${esc(x[1])}</small></a>`).join('')}</div>
      <div class="mc-section-label">MODEL AND LIMITATIONS</div><p class="mc-fine">Illustrative demonstration thresholds: optical depth τ below 0.8 = low, 0.8–2.0 = caution, 2.0 and above = hold. These are <strong>not NASA EVA standards</strong> and do not substitute for visibility, solar power, thermal, electrostatic dust, dose monitors, mission flight rules or a site-specific forecast. The 72 h age check is a prototype stale-data rule, not a certified cutoff.</p>`;
  }
  function render() {
    const a=assess();
    const statusClass=a.level==='hold'?'mc-status-red':a.level==='watch'?'mc-status-amber':a.level==='clear'?'mc-status-green':'mc-status-neutral';
    host.innerHTML=`
      <button class="mc-launch ${statusClass}" data-action="toggle" aria-haspopup="dialog" aria-expanded="${state.open}"><span class="mc-dot"></span><span class="mc-launch-label"><strong>CONDITIONS & ABORT</strong><small>${esc(a.short)} · ${state.source==='simulated'?'SIMULATION':'NO LIVE CLEARANCE'}</small></span>${svgIcon('chevron')}</button>
      <section class="mc-panel ${state.open?'mc-open':''}" role="dialog" aria-modal="false" aria-label="MARVIN Conditions and Abort Plan" ${state.open?'':'hidden'}>
        <header class="mc-header"><div class="mc-overline">MARVIN / FLIGHT SAFETY CONCEPT</div><button class="mc-close" data-action="close" aria-label="Close panel">×</button><h2>Conditions <em>&</em> abort plan</h2><p>JEZERO CRATER / EVA MISSION SAFETY</p></header>
        <div class="mc-banner ${statusClass}"><span class="mc-light"></span><div><small>GO / NO-GO · ${state.source==='simulated'?'TRAINING SIMULATION':'DATA STATUS'}</small><strong>${esc(a.short)}</strong></div><span class="mc-bannerright">${modeName()}</span></div>
        <nav class="mc-tabs" aria-label="Conditions views"><button data-action="tab-overview" class="${state.tab==='overview'?'active':''}">Conditions</button><button data-action="tab-actions" class="${state.tab==='actions'?'active':''}">Contingency</button><button data-action="tab-sources" class="${state.tab==='sources'?'active':''}">NASA data</button></nav>
        <div class="mc-scroll">${state.tab==='overview'?renderOverview(a):state.tab==='actions'?renderActions(a):renderSources()}</div>
        <footer class="mc-footer"><span><i class="mc-footer-dot"></i> PROTOTYPE · NO OPERATIONAL TELEMETRY</span><button data-action="tab-actions">ABORT PLAN ${svgIcon('chevron')}</button></footer>
      </section>`;
  }
  function scenarioSet(k) {
    const s=scenarios[k];if (!s)return;
    state.scenario=k;state.conditions=s.data?{...s.data}:null;
    state.source=s.data?'simulated':'none';state.observedAt=null;
    state.requested=false;state.checkboxes={};render();
  }
  function updateMission(p) {state.mission=cleanMission(p);state.requested=false;render();}
  function setObservations(p) {
    if (!p || typeof p!=='object') throw new Error('Observations object required');
    state.conditions={
      tau:num(p.tau),windMps:num(p.windMps),
      solarEvent:['none','warning','event'].includes(p.solarEvent)?p.solarEvent:'unknown'
    };
    state.source=p.source==='connected'?'connected':'archived';
    state.observedAt=p.observedAt||null;
    state.scenario='unknown';state.requested=false;render();
  }
  function importMissionJSON(data) {
    let j=typeof data==='string'?JSON.parse(data):data;
    if (!j || typeof j!=='object')throw new Error('Invalid mission JSON');
    updateMission({
      name:j.title||j.name||'Jezero EVA',
      durationMin:j.durationMin??j.stats?.durationMin??j.stats?.duration_minutes??j.stats?.duration??j.mission?.durationMin??j.total_time_min,
      elapsedMin:j.elapsedMin??j.mission?.elapsedMin??0,
      returnMin:j.returnMin??j.mission?.returnMin??j.estimated_return_min,
      distanceKm:j.distanceKm??j.stats?.distance_km??j.stats?.distanceKm,
      reserveFraction:j.assumptions?.return_reserve_fraction??j.reserveFraction??0.2,
      stopName:j.currentStop || 'Mission route'
    });
    return state.mission;
  }
  host.addEventListener('click',function(e){
    const target=e.target.closest('[data-action]');if (!target)return;
    const x=target.dataset.action;
    if(x==='toggle'){state.open=!state.open;render();}
    if(x==='close'){state.open=false;render();}
    if(x.startsWith('tab-')){state.tab=x.slice(4);state.open=true;render();}
    if(x==='edit-route'){state.manual=!state.manual;render();}
    if(x==='apply-route'){
      const n=(k)=>{const field=$(`[data-field="${k}"]`);return field && field.value!=='' ? Number(field.value):null;};
      updateMission({...state.mission,durationMin:n('duration'),elapsedMin:n('elapsed')||0,returnMin:n('return')});
    }
    if(x==='abort'){
      state.requested=true;
      const assessment=assess();
      w.dispatchEvent(new CustomEvent('marswalk:abort-request',{detail:{reason:assessment.short,causes:assessment.causes,mission:state.mission,assessment,requestedAt:new Date().toISOString()}}));
      render();
    }
  });
  host.addEventListener('change',function(e){
    if(e.target?.dataset?.field==='scenario')scenarioSet(e.target.value);
    if(e.target?.dataset?.check){state.checkboxes[e.target.dataset.check]=e.target.checked;}
  });
  w.addEventListener('marswalk:mission-update',e=>updateMission(e.detail));
  w.addEventListener('marswalk:conditions-update',e=>setObservations(e.detail));
  w.addEventListener('keydown',e=>{if(e.key==='Escape'&&state.open){state.open=false;render();}});
  w.MarswalkConditions={
    version:'1.0.0',
    open:()=>{state.open=true;render();},
    close:()=>{state.open=false;render();},
    updateMission,setObservations,importMissionJSON,
    setScenario:scenarioSet,
    getAssessment:()=>JSON.parse(JSON.stringify(assess())),
    getMission:()=>state.mission?{...state.mission}:null,
    getHistoricalData:()=>({radiation:{site:"Gale Crater",period:"Aug 2012–Jun 2013",doseEquivalentMsvPerDay:GALE_RAD_MSV_DAY,source:NASA.rad},dust:{site:"Jezero Crater",period:"Jan 2022",visibleOpticalDepth:JEZERO_DUST_HISTORY.map(x=>({...x})),source:NASA.stormStudy}}),
    getProvenance:()=>({type:state.source,observedAt:state.observedAt,description:stateLabel()}),
    NASA
  };
  render();
  w.dispatchEvent(new CustomEvent('marswalk:conditions-ready',{detail:{api:w.MarswalkConditions}}));
})(window, document);
