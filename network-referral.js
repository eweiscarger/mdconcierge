/* MDconcierge — in-network service request widget (shared).
   Used by respond.html (provider), status.html (attorney), portal.html (per case).

   Black-box by design: the referrer NEVER browses the network or picks a provider.
   They just say what the patient needs (a service type + optional note) and hit Send.
   MDconcierge places it with an in-network PRACTICE near the patient (proximity +
   specialty + relationship ranking on OUR side); the practice's coordinator schedules
   and reports the treating provider via the existing route-to-practice flow.

   Mount with:
     NetReferral.mount({ sb, token, container:'net-ref', ref:'MDC-...', preselect:'' });

   Send calls RPC request_in_network(p_token, p_service, p_note). If that RPC isn't
   deployed yet, it falls back to a one-click email to referrals@mdconcierge.net,
   so the widget works either way.
*/
(function(){
  'use strict';

  function esc(s){return String(s==null?'':s).replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));}
  function norm(s){return String(s==null?'':s).toLowerCase();}

  /* Service types the referrer can request. Controlled list — edit here. */
  var SERVICES=['Physical Therapy','Imaging / MRI','Pain Management','Orthopaedics','Orthopedic Spine','Neurosurgery','Chiropractic','Pharmacy','Podiatry / Foot & Ankle'];
  var ICONS={
    'physical therapy':'🏃','imaging / mri':'🔬','pain management':'💉','orthopaedics':'🦴',
    'orthopedic spine':'🩻','neurosurgery':'🧠',
    'chiropractic':'🔄','pharmacy':'💊','podiatry / foot & ankle':'🦶'
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
      '.nr-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(86px,1fr));gap:6px;margin:6px 0 2px;}'+
      '.nr-tile{padding:9px 5px;border:1.5px solid #e3e6ea;border-radius:8px;font-size:10.5px;font-weight:600;text-align:center;cursor:pointer;background:#fff;color:#1a2230;font-family:inherit;line-height:1.2;transition:all .12s;}'+
      '.nr-tile:hover{border-color:#c8922a;}'+
      '.nr-tile.sel{border-color:#c8922a;background:#fdf6e8;color:#8a5a00;}'+
      '.nr-tile .ic{font-size:17px;display:block;margin-bottom:3px;}';
    document.head.appendChild(s);
  }

  function NetReferral_mount(opts){
    var sb=opts.sb, token=opts.token, ref=opts.ref||'', preselect=opts.preselect||'';
    var host=document.getElementById(opts.container);
    if(!host)return;
    ensureStyles();

    host.innerHTML=
      '<div class="box">'+
      '<h3>Need something else for this patient?</h3>'+
      '<div class="muted" style="margin-bottom:8px;">Tell us what they need and we\'ll place it with an in-network provider near your patient — and coordinate the scheduling. Just pick a service.</div>'+
      '<div id="nr-types" class="nr-grid"></div>'+
      '<input id="nr-note" placeholder="Anything specific? (e.g. left knee MRI, post-op PT, Spanish-speaking)" style="width:100%;box-sizing:border-box;padding:10px 12px;border:1px solid #cdd3da;border-radius:8px;font-size:14px;margin:10px 0 8px;"/>'+
      '<button class="btn navy" id="nr-send" disabled style="margin:0;opacity:.5;">Send to MDconcierge</button>'+
      '<div class="muted" id="nr-done" style="margin-top:8px;font-weight:600;"></div>'+
      '</div>';

    var typeBox=document.getElementById('nr-types');
    var noteEl=document.getElementById('nr-note');
    var sendBtn=document.getElementById('nr-send');
    var done=document.getElementById('nr-done');
    var selected='';

    function setDone(msg,color){done.style.color=color||'#6b7583';done.textContent=msg||'';}
    function setSend(on){sendBtn.disabled=!on;sendBtn.style.opacity=on?1:.5;}
    function paint(){
      typeBox.querySelectorAll('button[data-svc]').forEach(function(b){
        if(b.getAttribute('data-svc')===selected)b.classList.add('sel');else b.classList.remove('sel');
      });
    }

    typeBox.innerHTML=SERVICES.map(function(s){
      return '<button data-svc="'+esc(s)+'" class="nr-tile"><span class="ic">'+iconFor(s)+'</span>'+esc(s)+'</button>';
    }).join('');
    typeBox.querySelectorAll('button[data-svc]').forEach(function(b){
      b.onclick=function(){selected=b.getAttribute('data-svc');setDone('');paint();setSend(true);};
    });

    function emailFallback(note){
      var subj='In-network request: '+selected+(ref?(' — '+ref):'');
      var body='Please place '+selected+' for '+(ref?('referral '+ref):'this patient')+'.'+(note?('\n\nDetails: '+note):'')+'\n\n';
      setDone('');
      done.innerHTML='<a class="btn navy" style="margin:0;" href="mailto:referrals@mdconcierge.net?subject='+encodeURIComponent(subj)+'&body='+encodeURIComponent(body)+'">✉ Send '+esc(selected)+' request to our team</a>';
    }

    async function send(){
      if(!selected){setDone('Pick a service first.','#c0392b');return;}
      var note=(noteEl.value||'').trim();
      sendBtn.disabled=true;sendBtn.textContent='Sending…';
      setDone('Sending…','#6b7583');
      try{
        var res=await sb.rpc('request_in_network',{p_token:token,p_service:selected,p_note:note});
        if(res.error||!res.data||!res.data.ok)throw (res.error||new Error('rpc'));
        setDone('✓ Got it — we\'re placing '+(res.data.service||selected)+' with an in-network provider near your patient. We\'ll coordinate the scheduling from here.','#1e9e6a');
        sendBtn.textContent='✓ Sent';
      }catch(e){
        // RPC not available yet → fall back to a one-click email request.
        sendBtn.style.display='none';
        emailFallback(note);
      }
    }
    sendBtn.onclick=send;

    // Email deep-link: ?refer=Pain%20Management pre-selects that service.
    if(preselect){
      var hit='';
      SERVICES.forEach(function(s){if(norm(s)===norm(preselect))hit=s;});
      if(!hit)SERVICES.forEach(function(s){if(!hit&&(norm(s).indexOf(norm(preselect))>=0||norm(preselect).indexOf(norm(s))>=0))hit=s;});
      if(hit){selected=hit;paint();setSend(true);}
    }
  }

  window.NetReferral={mount:NetReferral_mount};
})();
