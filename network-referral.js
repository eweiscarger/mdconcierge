/* MDconcierge — shared in-network referral widget.
   Used by respond.html (provider page) and status.html (attorney page) so the
   logic lives in ONE place instead of being copy-pasted into both.

   Mount with:
     NetReferral.mount({
       sb,                       // the supabase client
       token,                   // the case token (t=)
       container:'net-ref',     // id of the element to render into
       patient:{ zip:'19103' }, // patient location (zip drives the mileage sort)
       ref:'MDC-...'            // case reference, used for the email fallback
     });

   Flow: heading → choose a type of provider / ancillary service → it filters to
   matching in-network providers, each showing specialty · city, state · miles
   from the patient, sorted closest → furthest. Picks a provider and sends it
   through the refer_in_network RPC. If no in-network provider matches a chosen
   service yet, it falls back to a one-click email request.
*/
(function(){
  'use strict';

  function esc(s){return String(s==null?'':s).replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));}
  function norm(s){return String(s==null?'':s).toLowerCase();}

  /* ── Geo: ZIP3 (first 3 digits) → [lat,lng] approximate area centroids ──
     Covers the tri-state footprint + bordering metros. These are rough centroids
     used only to ORDER providers by distance — expand or correct freely. */
  const ZIP3={
    // Pennsylvania
    '150':[40.44,-79.99],'151':[40.50,-79.90],'152':[40.43,-79.95],'153':[40.32,-79.85],'154':[40.62,-79.74],
    '155':[40.32,-78.92],'156':[40.32,-79.00],'157':[40.20,-78.40],'158':[41.95,-78.65],'159':[41.16,-78.74],
    '160':[41.00,-80.34],'161':[41.05,-80.10],'162':[41.40,-80.36],'163':[41.43,-79.69],'164':[42.13,-80.08],
    '165':[42.10,-80.10],'166':[40.80,-77.86],'167':[41.50,-78.00],'168':[41.95,-77.65],'169':[41.77,-77.30],
    '170':[40.27,-76.88],'171':[40.30,-76.90],'172':[40.26,-76.66],'173':[40.10,-77.20],'174':[39.96,-76.73],
    '175':[40.04,-76.50],'176':[40.04,-76.30],'177':[40.34,-76.42],'178':[40.46,-76.42],'179':[40.33,-76.18],
    '180':[40.60,-75.47],'181':[40.60,-75.50],'182':[40.83,-75.70],'183':[40.83,-75.70],'184':[41.41,-75.66],
    '185':[41.41,-75.66],'186':[41.25,-75.88],'187':[41.25,-75.88],'188':[41.33,-75.78],'189':[40.31,-75.13],
    '190':[40.12,-75.34],'191':[39.95,-75.16],'193':[40.04,-75.50],'194':[40.10,-75.35],'195':[40.34,-75.93],'196':[40.34,-75.93],
    // New Jersey
    '070':[40.73,-74.17],'071':[40.73,-74.17],'072':[40.66,-74.21],'073':[40.72,-74.05],'074':[40.92,-74.17],
    '075':[40.92,-74.17],'076':[40.89,-74.04],'077':[40.35,-74.07],'078':[40.88,-74.56],'079':[40.71,-74.36],
    '080':[39.93,-75.03],'081':[39.93,-75.11],'082':[39.39,-74.50],'083':[39.49,-75.03],'084':[39.36,-74.42],
    '085':[40.22,-74.76],'086':[40.22,-74.76],'087':[40.09,-74.22],'088':[40.49,-74.45],'089':[40.49,-74.45],
    // Delaware
    '197':[39.74,-75.55],'198':[39.74,-75.55],'199':[39.30,-75.55],
    // NY metro / borders
    '100':[40.78,-73.97],'101':[40.78,-73.97],'103':[40.58,-74.15],'104':[40.84,-73.87],'105':[41.03,-73.76],
    '110':[40.70,-73.80],'111':[40.70,-73.80],'112':[40.65,-73.95],'113':[40.73,-73.79],'114':[40.76,-73.87],'115':[40.75,-73.55],
    // Maryland borders
    '209':[39.00,-77.02],'210':[39.29,-76.61],'211':[39.29,-76.61],'212':[39.29,-76.61],'214':[39.65,-75.95],'216':[39.20,-76.07],'217':[39.41,-77.41]
  };

  function fiveDigit(s){const m=String(s==null?'':s).match(/\b(\d{5})\b/);return m?m[1]:'';}
  function zipOf(p){
    // Pull a 5-digit zip from whatever location-ish field a provider carries.
    const cands=[p&&p.zip,p&&p.postal,p&&p.postal_code,p&&p.address,p&&p.location_address,p&&p.location,p&&p.city_state_zip,p&&p.states];
    for(var i=0;i<cands.length;i++){var z=fiveDigit(cands[i]);if(z)return z;}
    return '';
  }
  function ptOf(zip){if(!zip)return null;return ZIP3[String(zip).slice(0,3)]||null;}
  function miles(a,b){
    if(!a||!b)return null;
    var R=3958.8,toR=function(x){return x*Math.PI/180;};
    var dLat=toR(b[0]-a[0]),dLng=toR(b[1]-a[1]);
    var s=Math.sin(dLat/2)*Math.sin(dLat/2)+Math.cos(toR(a[0]))*Math.cos(toR(b[0]))*Math.sin(dLng/2)*Math.sin(dLng/2);
    return 2*R*Math.asin(Math.sqrt(s));
  }
  function fmtMiles(d){return d==null?'':(d<10?d.toFixed(1):Math.round(d))+' mi';}
  function cityStateOf(p){
    if(p&&p.city){return p.city+(p.state?(', '+p.state):'');}
    var src=(p&&(p.address||p.location_address||p.location))||'';
    var m=String(src).match(/([A-Za-z .'\-]+),\s*([A-Z]{2})\b/);
    if(m)return m[1].trim()+', '+m[2];
    return '';
  }

  /* ── Categories: a CONTROLLED tile set. Provider specialties are bucketed into
        these via synonyms (e.g. "Radiology" → Imaging/MRI, "Foot & Ankle" →
        Podiatry) so stray specialties never spawn rogue tiles. Edit CANON to
        add/remove a tile. ── */
  var CANON=['Physical Therapy','Imaging / MRI','Pain Management','Orthopaedics','Chiropractic','Pharmacy','Podiatry / Foot & Ankle'];
  var SYN={
    'imaging / mri':['imaging','mri','radiolog','x-ray','x ray'],
    'physical therapy':['physical therapy','physiotherap','rehab',' pt','pt ','physiatr'],
    'pain management':['pain'],
    'orthopaedics':['ortho'],
    'chiropractic':['chiro'],
    'pharmacy':['pharmac','rx'],
    'podiatry / foot & ankle':['podiat','foot','ankle']
  };
  function matchCat(p,cat){
    var hay=norm(p&&p.specialty)+' '+norm(p&&p.type)+' '+norm(p&&p.provider_type)+' '+norm(p&&p.name);
    var c=norm(cat);
    if(c&&hay.indexOf(c)>=0)return true;              // direct text hit
    var keys=SYN[c]||[c];
    for(var i=0;i<keys.length;i++){if(keys[i]&&hay.indexOf(keys[i])>=0)return true;}
    return false;
  }

  function buildCategories(providers){
    // Controlled list only — NOT auto-derived from data (keeps the tile set clean;
    // providers bucket into these via matchCat).
    return CANON.slice();
  }

  var ICONS={
    'physical therapy':'🏃','imaging / mri':'🔬','imaging':'🔬','mri':'🔬',
    'pain management':'💉','orthopaedics':'🦴','orthopedics':'🦴','orthopedic surgery':'🦴','orthopedic surgeon':'🦴',
    'chiropractic':'🔄','pharmacy':'💊','neurosurgery':'🧬','spine':'🩻','podiatry':'🦶',
    'primary care':'🩺'
  };
  function iconFor(c){
    var k=norm(c).trim();
    if(ICONS[k])return ICONS[k];
    for(var key in ICONS){if(ICONS.hasOwnProperty(key)&&k.indexOf(key)>=0)return ICONS[key];}
    return '🏥';
  }
  function ensureStyles(){
    if(document.getElementById('nr-styles'))return;
    var s=document.createElement('style');s.id='nr-styles';
    s.textContent=
      '.nr-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(78px,1fr));gap:5px;margin:4px 0 2px;}'+
      '.nr-tile{padding:5px 4px;border:1px solid #e3e6ea;border-radius:7px;font-size:9.5px;font-weight:600;text-align:center;cursor:pointer;background:#fff;color:#1a2230;font-family:inherit;line-height:1.15;transition:all .12s;}'+
      '.nr-tile:hover{border-color:#c8922a;}'+
      '.nr-tile.sel{border-color:#c8922a;background:#fdf6e8;color:#8a5a00;}'+
      '.nr-tile .ic{font-size:13px;display:block;margin-bottom:1px;}'+
      '.nr-tile .n{display:block;font-size:7.5px;color:#6b7583;font-weight:700;margin-top:1px;text-transform:uppercase;letter-spacing:.01em;}';
    document.head.appendChild(s);
  }

  function NetReferral_mount(opts){
    var sb=opts.sb, token=opts.token, ref=opts.ref||'', preselect=opts.preselect||'';
    var host=document.getElementById(opts.container);
    if(!host)return;
    var patientPt=ptOf((opts.patient&&opts.patient.zip)||'');

    ensureStyles();
    host.innerHTML=
      '<div class="box">'+
      '<h3>Refer within the MDconcierge network</h3>'+
      '<div class="muted" style="margin-bottom:10px;">Kindly refer to a network provider or ancillary service — pick a type below, then choose a provider'+(patientPt?' (closest to the patient first)':'')+'. We coordinate the rest.</div>'+
      '<div id="nr-types" class="nr-grid"><span class="muted">Loading network…</span></div>'+
      '<div class="muted" id="nr-count" style="margin:14px 0 6px;">Select a type above to see in-network providers.</div>'+
      '<select id="nr-prov" disabled style="width:100%;padding:11px;border:1px solid #cdd3da;border-radius:8px;font-size:14px;margin-bottom:8px;background:#f4f6f8;color:#9aa3af;"><option>— Select a type first —</option></select>'+
      '<button class="btn navy" id="nr-send" disabled style="margin:0;opacity:.5;">Send referral</button>'+
      '<div id="nr-fallback" style="margin-top:8px;"></div>'+
      '<div class="muted" id="nr-done" style="margin-top:8px;font-weight:600;"></div>'+
      '</div>';

    var typeBox=document.getElementById('nr-types');
    var countEl=document.getElementById('nr-count');
    var provSel=document.getElementById('nr-prov');
    var sendBtn=document.getElementById('nr-send');
    var fallbackEl=document.getElementById('nr-fallback');
    var done=document.getElementById('nr-done');
    var PROVIDERS=[], selectedCat='';

    function setDone(msg,color){done.style.color=color||'#6b7583';done.textContent=msg||'';}

    function withDistance(list){
      return list.map(function(p){
        var z=zipOf(p), d=miles(patientPt,ptOf(z));
        return {p:p,zip:z,dist:d,city:cityStateOf(p)};
      }).sort(function(a,b){
        if(a.dist==null&&b.dist==null)return norm(a.p.name)<norm(b.p.name)?-1:1;
        if(a.dist==null)return 1; if(b.dist==null)return -1;
        return a.dist-b.dist;
      });
    }

    function setSend(on){sendBtn.disabled=!on;sendBtn.style.opacity=on?1:.5;}
    function lockSelect(placeholder){
      provSel.disabled=true;provSel.style.background='#f4f6f8';provSel.style.color='#9aa3af';
      provSel.innerHTML='<option>'+esc(placeholder)+'</option>';setSend(false);
    }
    function paintTypes(){
      typeBox.querySelectorAll('button[data-cat]').forEach(function(b){
        if(b.getAttribute('data-cat')===selectedCat)b.classList.add('sel');else b.classList.remove('sel');
      });
    }

    function optLabel(r){
      var bits=[r.p.name];
      if(r.city)bits.push(r.city);
      if(r.dist!=null)bits.push(fmtMiles(r.dist));
      else bits.push('distance n/a');
      var s=bits.join(' · ');
      if(r.p.practice)s+=' ('+r.p.practice+')';
      return s;
    }

    function fillSelect(rows,cat){
      provSel.disabled=false;provSel.style.background='#fff';provSel.style.color='#1c1917';
      provSel.innerHTML='<option value="">— Choose a provider —</option>'+
        rows.map(function(r){return '<option value="'+r.p.id+'" data-svc="'+esc(r.p.specialty||r.p.type||cat||'')+'">'+esc(optLabel(r))+'</option>';}).join('');
      setSend(false);
    }
    function showFallback(cat){
      var subj='Refer: '+cat+(ref?(' — '+ref):'');
      var body='Please coordinate '+cat+(ref?(' for referral '+ref):'')+'.\n\n';
      fallbackEl.innerHTML='<a class="btn navy" style="margin:0;" href="mailto:referrals@mdconcierge.net?subject='+encodeURIComponent(subj)+'&body='+encodeURIComponent(body)+'">✉ Request '+esc(cat)+' from our team</a>';
    }
    function renderResults(){
      var cat=selectedCat;
      fallbackEl.innerHTML='';
      if(!cat){
        // No type chosen → dropdown shows EVERYONE (closest first); tiles narrow it.
        if(!PROVIDERS.length){countEl.textContent='Tap a type above and we\'ll line up a provider.';lockSelect('— Pick a type —');return;}
        var all=withDistance(PROVIDERS.slice());
        countEl.innerHTML=all.length+' in-network '+(all.length===1?'provider':'providers')+(patientPt?' — closest first':'')+' · tap a type to filter';
        fillSelect(all,'');
        return;
      }
      var matches=PROVIDERS.filter(function(p){return matchCat(p,cat);});
      if(!matches.length){
        // None in network for this type yet → one-tap email request (works pre-launch / empty network).
        countEl.innerHTML='No in-network provider for <b>'+esc(cat)+'</b> yet — we can still coordinate it:';
        lockSelect('— None in network —');
        showFallback(cat);
        return;
      }
      var rows=withDistance(matches);
      countEl.innerHTML=rows.length+' in-network '+(rows.length===1?'provider':'providers')+' for <b>'+esc(cat)+'</b>'+(patientPt?' — closest first':'');
      fillSelect(rows,cat);
    }

    provSel.onchange=function(){setSend(!!provSel.value);};
    sendBtn.onclick=send;

    async function send(){
      var pid=parseInt(provSel.value,10);
      if(!pid){setDone('Pick a provider first.','#c0392b');return;}
      var svc=(provSel.options[provSel.selectedIndex].getAttribute('data-svc')||selectedCat||'Referral').trim()||'Referral';
      sendBtn.disabled=true;sendBtn.textContent='Sending…';
      setDone('Sending…','#6b7583');
      var res=await sb.rpc('refer_in_network',{p_token:token,p_provider_id:pid,p_service:svc});
      if(res.error||!res.data||!res.data.ok){setDone('Could not send — please try again.','#c0392b');sendBtn.disabled=false;sendBtn.textContent='Send referral';return;}
      setDone('✓ Referred to '+(res.data.provider||'the provider')+' for '+(res.data.service||svc)+' — we\'ll coordinate it.','#1e9e6a');
      sendBtn.textContent='✓ Referred';
    }

    (async function load(){
      try{var r=await sb.rpc('network_providers');PROVIDERS=r.data||[];}catch(e){PROVIDERS=[];}
      var cats=buildCategories(PROVIDERS);
      if(!cats.length){typeBox.innerHTML='<span class="muted">No network providers available</span>';return;}
      // A tile per provider/service type; show count of in-network options.
      typeBox.innerHTML=cats.map(function(c){
        var n=PROVIDERS.filter(function(p){return matchCat(p,c);}).length;
        return '<button data-cat="'+esc(c)+'" class="nr-tile"><span class="ic">'+iconFor(c)+'</span>'+esc(c)+'<span class="n">'+(n?(n+' in-network'):'request')+'</span></button>';
      }).join('');
      typeBox.querySelectorAll('button[data-cat]').forEach(function(b){
        b.onclick=function(){selectedCat=b.getAttribute('data-cat');setDone('');paintTypes();renderResults();};
      });
      renderResults(); // dropdown shows ALL providers up front; tiles narrow it
      // Deep-link: open straight to a type if ?refer=/preselect was provided.
      if(preselect){
        var hit=null;
        cats.forEach(function(c){if(norm(c)===norm(preselect))hit=c;});
        if(!hit)cats.forEach(function(c){if(!hit&&(norm(c).indexOf(norm(preselect))>=0||norm(preselect).indexOf(norm(c))>=0))hit=c;});
        if(hit){selectedCat=hit;paintTypes();renderResults();}
      }
    })();
  }

  window.NetReferral={mount:NetReferral_mount};
})();
