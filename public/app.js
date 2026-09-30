(function(){
  var tg = window.Telegram && window.Telegram.WebApp ? window.Telegram.WebApp : null;
  if (tg) { tg.ready(); tg.expand(); }
  var initData = tg ? tg.initData : '';

  var MIN = 1000;
  var COLS = ['B','S','4A','4B','4C','4E'];
  var HOUSES_4D = ['Magnum','Toto','Damacai','Dragon','9Lotto','Singapore'];
  var HOUSES_ND = ['Toto','Dragon','9Lotto'];
  var mode = '4';
  var isAdmin = false;
  var $ = function(id){ return document.getElementById(id); };

  function esc(s){
    return String(s==null?'':s).replace(/[&<>\"']/g, function(c){
      return {'&':'&amp;','<':'&lt;','>':'&gt;','\"':'&quot;',"'":'&#39;'}[c];
    });
  }
  function money(n){ return Number(n||0).toLocaleString(); }

  // ---- API helper: always send Telegram initData for auth ----
  function api(path, opts){
    opts = opts || {};
    opts.headers = Object.assign({ 'Content-Type':'application/json', 'X-Telegram-Init-Data': initData }, opts.headers||{});
    return fetch('/api'+path, opts).then(function(r){
      return r.json().then(function(j){
        if(!r.ok) throw new Error(j.error||('HTTP '+r.status));
        return j;
      });
    });
  }

  function fillHouses(){
    var houses = mode==='4' ? HOUSES_4D : HOUSES_ND;
    var opt = houses.map(function(h){ return '<option value="'+h+'">'+h+'</option>'; }).join('');
    $('house').innerHTML = opt;
    if($('aHouse')) $('aHouse').innerHTML = opt;
  }

  function setMode(m){
    mode = m;
    document.querySelectorAll('.tab').forEach(function(t){ t.classList.toggle('active', t.getAttribute('data-mode')===m); });
    var is4 = m==='4';
    $('grid4d').style.display = is4?'block':'none';
    $('gridND').style.display = is4?'none':'block';
    fillHouses();
    if(!is4){ $('ndHint').textContent = 'Enter a '+m+'-digit NUMBER on each row and its stake. Minimum 1,000.'; buildGridND(Number(m)); }
    if(isAdmin) buildAdminFields();
    loadBets();
  }

  function buildGrid(){
    var rows='';
    for(var i=0;i<12;i++){
      var cells='<td class="colidx">'+(i+1)+'</td>';
      cells+='<td><input class="g-num" inputmode="numeric" maxlength="4" placeholder="----"></td>';
      COLS.forEach(function(c){ cells+='<td><input class="g-amt" data-col="'+c+'" inputmode="numeric" placeholder="1000"></td>'; });
      rows+='<tr>'+cells+'</tr>';
    }
    $('gridBody').innerHTML=rows;
  }
  function buildGridND(len){
    var ph=Array(len+1).join('-'); var rows='';
    for(var i=0;i<6;i++){
      rows+='<tr><td class="colidx">'+(i+1)+'</td>'+
        '<td><input class="nd-num" inputmode="numeric" maxlength="'+len+'" placeholder="'+ph+'"></td>'+
        '<td><input class="nd-amt" inputmode="numeric" placeholder="1000"></td></tr>';
    }
    $('gridNDBody').innerHTML=rows;
  }

  function collect4d(){
    var out=[]; var date=$('drawDate').value; var house=$('house').value; var customer=$('customer').value.trim();
    var low=false;
    $('gridBody').querySelectorAll('tr').forEach(function(tr){
      var num=tr.querySelector('.g-num').value.trim();
      if(!/^[0-9]{4}$/.test(num)) return;
      var cols={}; var total=0; var bad=false;
      tr.querySelectorAll('.g-amt').forEach(function(inp){ var v=Number(inp.value.trim()||0); if(v>0){ if(v<MIN) bad=true; cols[inp.getAttribute('data-col')]=v; total+=v; } });
      if(bad){ low=true; return; }
      if(total<=0) return;
      out.push({ mode:4, number:num, bet_type:'STRAIGHT', house:house, cols:cols, amount:total, customer:customer, draw_date:date });
    });
    return { rows:out, low:low };
  }
  function collectND(){
    var len=Number(mode); var re=new RegExp('^[0-9]{'+len+'}$');
    var out=[]; var date=$('drawDate').value; var house=$('house').value; var customer=$('customer').value.trim(); var low=false;
    $('gridNDBody').querySelectorAll('tr').forEach(function(tr){
      var num=tr.querySelector('.nd-num').value.trim();
      if(!re.test(num)) return;
      var amt=Number(tr.querySelector('.nd-amt').value.trim()||0);
      if(amt<=0) return;
      if(amt<MIN){ low=true; return; }
      out.push({ mode:len, number:num, bet_type:'STRAIGHT', house:house, cols:{}, amount:amt, customer:customer, draw_date:date });
    });
    return { rows:out, low:low };
  }

  function saveBets(collector, rebuild){
    var c=collector();
    if(c.low) alert('Minimum stake is 1,000.');
    if(!c.rows.length){ if(!c.low) alert('No valid rows.'); return; }
    api('/bets', { method:'POST', body: JSON.stringify({ bets:c.rows }) })
      .then(function(res){ rebuild(); loadBets(); if(tg) tg.HapticFeedback && tg.HapticFeedback.notificationOccurred('success'); })
      .catch(function(e){ alert('Save failed: '+e.message); });
  }

  function stakeText(b){
    if(Number(b.mode)!==4) return '-';
    var parts=[]; var cols=b.cols||{};
    COLS.forEach(function(c){ if(cols[c]) parts.push(c+' '+cols[c]); });
    return parts.length? parts.join(' · ') : '-';
  }

  function loadBets(){
    var date=$('drawDate').value;
    api('/bets'+(date?('?date='+encodeURIComponent(date)):''))
      .then(function(res){ renderBets(res.bets||[]); })
      .catch(function(e){ console.error(e); });
  }
  function renderBets(bets){
    var body=$('betBody');
    if(!bets.length){ body.innerHTML='<tr><td colspan="7" class="empty">No bets yet</td></tr>'; }
    else {
      body.innerHTML=bets.map(function(b){
        return '<tr>'+
          '<td><span class="badge">'+b.mode+'D</span></td>'+
          '<td><span class="num">'+esc(b.number)+'</span></td>'+
          '<td>'+esc(b.house)+'</td>'+
          '<td class="stk">'+esc(stakeText(b))+'</td>'+
          '<td>'+money(b.amount)+'</td>'+
          '<td>'+esc(b.customer||'-')+'</td>'+
          '<td><button class="btn btn-sm btn-danger" data-del="'+b.id+'">Del</button></td>'+
        '</tr>';
      }).join('');
    }
    var total=bets.reduce(function(s,b){return s+Number(b.amount||0);},0);
    $('totalCount').textContent=bets.length;
    $('countBadge').textContent=bets.length+' rows';
    $('totalAmount').textContent=money(total);
  }

  function report(){
    var date=$('drawDate').value;
    api('/reports/summary'+(date?('?date='+encodeURIComponent(date)):''))
      .then(function(r){
        var h='<div class="totals">';
        h+='<div class="stat"><div class="k">Scope</div><div class="v" style="font-size:16px;">'+esc(r.scope)+'</div></div>';
        h+='<div class="stat"><div class="k">Total Bets</div><div class="v">'+money(r.totals.bets)+'</div></div>';
        h+='<div class="stat"><div class="k">Total Staked</div><div class="v">'+money(r.totals.total_staked)+'</div></div>';
        h+='</div>';
        if(r.byHouse && r.byHouse.length){
          h+='<div class="sec-title">By House</div><div style="overflow-x:auto;"><table><thead><tr><th>House</th><th>Bets</th><th>Staked</th></tr></thead><tbody>';
          r.byHouse.forEach(function(x){ h+='<tr><td>'+esc(x.house)+'</td><td>'+money(x.bets)+'</td><td>'+money(x.staked)+'</td></tr>'; });
          h+='</tbody></table></div>';
        }
        if(r.byGame && r.byGame.length){
          h+='<div class="sec-title">By Game</div><div style="overflow-x:auto;"><table><thead><tr><th>Game</th><th>Bets</th><th>Staked</th></tr></thead><tbody>';
          r.byGame.forEach(function(x){ h+='<tr><td>'+x.mode+'D</td><td>'+money(x.bets)+'</td><td>'+money(x.staked)+'</td></tr>'; });
          h+='</tbody></table></div>';
        }
        $('reportArea').innerHTML=h; $('reportCard').style.display='block'; $('reportCard').scrollIntoView({behavior:'smooth'});
      })
      .catch(function(e){ alert('Report failed: '+e.message); });
  }

  // ---- Admin: enter winning numbers ----
  function buildAdminFields(){
    var h='';
    if(mode==='4'){
      h+='<div class="row" style="margin-top:12px;">'+
         '<div class="field"><label>1st Prize</label><input class="a-top" data-rank="1" inputmode="numeric" maxlength="4" placeholder="----"></div>'+
         '<div class="field"><label>2nd Prize</label><input class="a-top" data-rank="2" inputmode="numeric" maxlength="4" placeholder="----"></div>'+
         '<div class="field"><label>3rd Prize</label><input class="a-top" data-rank="3" inputmode="numeric" maxlength="4" placeholder="----"></div></div>';
      h+='<label style="margin-top:12px;">Starter Prizes (up to 10)</label><div class="gridin" id="aStarter"></div>';
      h+='<label style="margin-top:12px;">Consolation Prizes (up to 10)</label><div class="gridin" id="aConso"></div>';
      $('aFields').innerHTML=h;
      var s='',c='';
      for(var i=0;i<10;i++){ s+='<input class="a-starter" inputmode="numeric" maxlength="4" placeholder="----">'; c+='<input class="a-conso" inputmode="numeric" maxlength="4" placeholder="----">'; }
      $('aStarter').innerHTML=s; $('aConso').innerHTML=c;
    } else if(mode==='5'){
      h+='<div class="row" style="margin-top:12px;">'+
        '<div class="field"><label>1st (5)</label><input class="a-p5" data-rank="1" data-len="5" maxlength="5"></div>'+
        '<div class="field"><label>2nd (5)</label><input class="a-p5" data-rank="2" data-len="5" maxlength="5"></div>'+
        '<div class="field"><label>3rd (5)</label><input class="a-p5" data-rank="3" data-len="5" maxlength="5"></div></div>'+
        '<div class="row" style="margin-top:12px;">'+
        '<div class="field"><label>4th (last 4)</label><input class="a-p5" data-rank="4" data-len="4" maxlength="4"></div>'+
        '<div class="field"><label>5th (last 3)</label><input class="a-p5" data-rank="5" data-len="3" maxlength="3"></div>'+
        '<div class="field"><label>6th (last 2)</label><input class="a-p5" data-rank="6" data-len="2" maxlength="2"></div></div>';
      $('aFields').innerHTML=h;
    } else {
      h+='<div class="row" style="margin-top:12px;"><div class="field"><label>1st Prize (6 digits)</label><input id="aP6" inputmode="numeric" maxlength="6" placeholder="------"></div></div>';
      $('aFields').innerHTML=h;
    }
  }
  function gatherPrizes(){
    if(mode==='4'){
      var top={}; document.querySelectorAll('.a-top').forEach(function(i){ var v=i.value.trim(); if(/^[0-9]{4}$/.test(v)) top[i.getAttribute('data-rank')]=v; });
      var starters=[]; document.querySelectorAll('.a-starter').forEach(function(i){ var v=i.value.trim(); if(/^[0-9]{4}$/.test(v)) starters.push(v); });
      var consos=[]; document.querySelectorAll('.a-conso').forEach(function(i){ var v=i.value.trim(); if(/^[0-9]{4}$/.test(v)) consos.push(v); });
      return { top:top, starters:starters, consos:consos };
    } else if(mode==='5'){
      var p={}; document.querySelectorAll('.a-p5').forEach(function(i){ var v=i.value.trim(); var need=Number(i.getAttribute('data-len')); if(v.length===need && /^[0-9]+$/.test(v)) p[i.getAttribute('data-rank')]=v; });
      return { p:p };
    } else {
      var v=$('aP6').value.trim(); if(!/^[0-9]{6}$/.test(v)) return null; return { p:{'1':v}, first:v };
    }
  }
  function adminSave(){
    var prizes=gatherPrizes(); if(!prizes){ alert('Enter valid winning numbers.'); return; }
    api('/draws', { method:'POST', body: JSON.stringify({ mode:Number(mode), house:$('aHouse').value, draw_date:$('aDate').value, draw_no:$('aDrawNo').value.trim(), prizes:prizes }) })
      .then(function(){ alert('Winning numbers saved.'); })
      .catch(function(e){ alert('Save failed: '+e.message); });
  }
  function adminCheck(){
    api('/draws/check', { method:'POST', body: JSON.stringify({ mode:Number(mode), house:$('aHouse').value, draw_date:$('aDate').value }) })
      .then(function(r){
        var h='<div class="winsum">Bets: <b>'+money(r.totals.bets)+'</b> · Staked: <b>'+money(r.totals.totalStaked)+'</b> · <span style="color:#16a34a;">Payout: <b>'+money(r.totals.totalPayout)+'</b></span></div>';
        if(r.wins.length){
          h+='<div style="overflow-x:auto;"><table><thead><tr><th>Prize</th><th>Number</th><th>User</th><th>Staked</th><th>Payout</th></tr></thead><tbody>';
          r.wins.sort(function(a,b){return a.rank-b.rank;}).forEach(function(w){ h+='<tr><td>'+esc(w.cat)+'</td><td><span class="num">'+esc(w.number)+'</span></td><td>'+esc(w.user_id)+'</td><td>'+money(w.amount)+'</td><td style="color:#16a34a;font-weight:700;">'+money(w.win)+'</td></tr>'; });
          h+='</tbody></table></div>';
        } else { h+='<div class="winsum">No winners.</div>'; }
        $('aResult').innerHTML=h;
      })
      .catch(function(e){ alert('Check failed: '+e.message); });
  }

  // ---- events ----
  document.querySelectorAll('.tab').forEach(function(t){ t.addEventListener('click', function(){ setMode(t.getAttribute('data-mode')); }); });
  $('saveGridBtn').addEventListener('click', function(){ saveBets(collect4d, buildGrid); });
  $('saveNDBtn').addEventListener('click', function(){ saveBets(collectND, function(){ buildGridND(Number(mode)); }); });
  $('betBody').addEventListener('click', function(e){
    var id=e.target.getAttribute('data-del');
    if(id){ api('/bets/'+id, { method:'DELETE' }).then(loadBets).catch(function(err){ alert(err.message); }); }
  });
  $('reloadBtn').addEventListener('click', loadBets);
  $('reportBtn').addEventListener('click', report);
  $('reportCloseBtn').addEventListener('click', function(){ $('reportCard').style.display='none'; });
  $('drawDate').addEventListener('change', loadBets);
  if($('aSaveBtn')) $('aSaveBtn').addEventListener('click', adminSave);
  if($('aCheckBtn')) $('aCheckBtn').addEventListener('click', adminCheck);

  // ---- init ----
  var today=new Date().toISOString().slice(0,10);
  $('drawDate').value=today; if($('aDate')) $('aDate').value=today;
  buildGrid(); fillHouses(); setMode('4');

  // Identify user + admin status via a lightweight report call (auth upserts user).
  api('/reports/summary').then(function(r){
    isAdmin = r.scope==='global';
    var name = tg && tg.initDataUnsafe && tg.initDataUnsafe.user ? (tg.initDataUnsafe.user.first_name||'') : '';
    $('whoami').textContent = (name?('Signed in as '+name):'Signed in') + (isAdmin?' (admin)':'');
    if(isAdmin){ $('adminCard').style.display='block'; buildAdminFields(); }
  }).catch(function(e){
    $('whoami').textContent = 'Auth error: open this app from inside Telegram.';
  });
})();
