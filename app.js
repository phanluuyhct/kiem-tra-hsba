// App Kiểm tra hồ sơ bệnh án – Phòng KHTH, Bệnh viện 30-4
// Dữ liệu: Supabase (dự án khth-bv304), bảng hsba_ho_so, hsba_loi, hsba_tai_khoan (tài khoản riêng)
(function(){
const SB_URL='https://ljkfxhdcmfngdtditeyy.supabase.co';
const SB_KEY='sb_publishable_jHDgrrBk27mdZPbCkC2FRg_9mx76Smq';
const sb=supabase.createClient(SB_URL,SB_KEY,{auth:{persistSession:true,autoRefreshToken:true,detectSessionInUrl:true}});

const $=id=>document.getElementById(id);
const esc=s=>String(s??'').replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
const pad=n=>String(n).padStart(2,'0');
const today=()=>{const d=new Date();return `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}`};
const fmtD=s=>{if(!s)return '';const [d,t]=String(s).split(' ');const [y,m,dd]=d.split('-');return dd?`${dd}/${m}/${y}`+(t?` ${t}`:''):s};
const ymLabel=ym=>{const [y,m]=ym.split('-');return `Tháng ${+m}/${y}`};
const pct=(a,b)=>b?Math.round(a/b*1000)/10:null;
const fmtP=p=>p==null?'–':p.toLocaleString('vi-VN')+'%';
const lastDay=ym=>{const [y,m]=ym.split('-').map(Number);return `${ym}-${pad(new Date(y,m,0).getDate())}`};
let tt;function toast(t){const el=$('toast');el.textContent=t;el.hidden=false;clearTimeout(tt);tt=setTimeout(()=>el.hidden=true,3000)}
function screen(n){['scrLogin','scrNoAccess','scrApp'].forEach(s=>$(s).hidden=s!==n)}

let me=null,meProfile=null,isManager=false;
let curYM=today().slice(0,7);
let recs=new Map(); // id -> record
let loiDM=[];       // [{id,ten,thu_tu}]
const names={};     // profile id -> tên
let filt={st:'',khoa:'',q:''};
let selected=new Set();
let view='ho-so';

/* ---------- Ánh xạ dòng dữ liệu ---------- */
function fromRow(r){return {k:String(r.id),id:r.id,ma:r.ma,hoTen:r.ho_ten||'',namSinh:r.nam_sinh||'',gioi:r.gioi||'',khoa:r.khoa||'',ngayVao:r.ngay_vao||'',diaChi:r.dia_chi||'',
  ngayRa:r.ngay_ra+(r.gio_ra?' '+r.gio_ra:''),huong:r.huong||'',giao:r.giao,ngayGiao:r.ngay_giao,danhGia:r.danh_gia,loi:r.loi||[],ghiChu:r.ghi_chu||'',
  nguoiKT:r.nguoi_kt,capNhatLuc:r.cap_nhat_luc,nguon:r.nguon}}
function toPatch(p){const o={};const map={giao:'giao',ngayGiao:'ngay_giao',danhGia:'danh_gia',loi:'loi',ghiChu:'ghi_chu',nguoiKT:'nguoi_kt',capNhatLuc:'cap_nhat_luc'};
  Object.keys(p).forEach(k=>{if(map[k])o[map[k]]=p[k]});return o}
let coDiaChi=true;const COLS0='id,ma,ngay_ra,gio_ra,ho_ten,nam_sinh,gioi,khoa,ngay_vao,huong,giao,ngay_giao,danh_gia,loi,ghi_chu,nguoi_kt,cap_nhat_luc,nguon';
const COLS=()=>COLS0+(coDiaChi?',dia_chi':'');
async function fetchRange(from,to,cols){
  const out=[];let off=0;
  for(;;){const {data,error}=await sb.from('hsba_ho_so').select(cols||COLS()).gte('ngay_ra',from).lte('ngay_ra',to).order('id').range(off,off+999);
    if(error&&coDiaChi&&/dia_chi/.test(error.message||'')){coDiaChi=false;return fetchRange(from,to,cols&&cols.replace(',dia_chi',''))}
    if(error)throw error;out.push(...data);if(data.length<1000)break;off+=1000;}
  return out;
}

/* ---------- Trạng thái hồ sơ ---------- */
function stOf(r){if(!r.danhGia)return 'chua';return r.danhGia==='dat'?'dat':'khong'}
const ST={chua:'Chưa đánh giá',dat:'Đạt',khong:'Không đạt'};
const STC={chua:'var(--muted)',gkhong:'var(--warn)',cho:'var(--info)',dat:'var(--good)',khong:'var(--bad)'};

/* ---------- Đăng nhập ---------- */
let recovery=false;
$('loginForm').addEventListener('submit',async e=>{e.preventDefault();$('lgErr').textContent='';$('lgBtn').disabled=true;
  const {error}=await sb.auth.signInWithPassword({email:$('lgEmail').value.trim(),password:$('lgPass').value});
  $('lgBtn').disabled=false;if(error)$('lgErr').textContent=/Invalid login/i.test(error.message)?'Email hoặc mật khẩu không đúng.':error.message;});
$('lgForgot').addEventListener('click',async()=>{const em=$('lgEmail').value.trim();if(!em){$('lgErr').textContent='Nhập email trước, rồi bấm “Quên mật khẩu?”.';return}
  const {error}=await sb.auth.resetPasswordForEmail(em,{redirectTo:location.origin+location.pathname});
  $('lgErr').textContent=error?error.message:'Đã gửi email đặt lại mật khẩu. Mở email và bấm vào đường dẫn.';});
$('newPassForm').addEventListener('submit',async e=>{e.preventDefault();const {error}=await sb.auth.updateUser({password:$('npPass').value});
  if(error){$('npErr').textContent=error.message;return}recovery=false;$('newPassForm').hidden=true;$('loginForm').hidden=false;toast('Đã đổi mật khẩu');start();});
document.querySelectorAll('[data-logout]').forEach(b=>b.addEventListener('click',async()=>{await sb.auth.signOut();location.hash='';location.reload()}));

$('lgToReg').addEventListener('click',()=>{$('loginForm').hidden=true;$('regForm').hidden=false;$('rgEmail').value=$('lgEmail').value});
$('rgBack').addEventListener('click',()=>{$('regForm').hidden=true;$('loginForm').hidden=false});
$('regForm').addEventListener('submit',async e=>{e.preventDefault();$('rgErr').textContent='';$('rgBtn').disabled=true;
  const {data,error}=await sb.auth.signUp({email:$('rgEmail').value.trim(),password:$('rgPass').value,options:{data:{app:'hsba',full_name:$('rgTen').value.trim()},emailRedirectTo:location.origin}});
  $('rgBtn').disabled=false;
  if(error){$('rgErr').textContent=/registered|exists/i.test(error.message)?'Email này đã có tài khoản (có thể là app Công việc KHTH). Hãy đăng nhập bằng mật khẩu cũ và nhờ quản trị thêm vào app.':error.message;return}
  if(data.user&&Array.isArray(data.user.identities)&&!data.user.identities.length){$('rgErr').textContent='Email này đã có tài khoản (có thể là app Công việc KHTH). Hãy đăng nhập bằng mật khẩu cũ và nhờ quản trị thêm vào app.';return}
  if(data.session){start();return}
  $('rgErr').textContent='Đã đăng ký. Mở email để xác nhận, sau đó chờ quản trị app duyệt.'});
sb.auth.onAuthStateChange((ev,session)=>{
  if(ev==='PASSWORD_RECOVERY'){recovery=true;screen('scrLogin');$('loginForm').hidden=true;$('newPassForm').hidden=false;return}
  if(ev==='SIGNED_IN'&&!me&&!recovery)start();
  if(ev==='SIGNED_OUT'){me=null;screen('scrLogin')}
});

let started=false;
async function start(){
  const {data:{session}}=await sb.auth.getSession();
  if(!session){screen('scrLogin');return}
  if(started)return;started=true;me=session.user;
  const {data:prof}=await sb.from('hsba_tai_khoan').select('user_id,ho_ten,vai_tro,hoat_dong').eq('user_id',me.id).maybeSingle();
  meProfile=prof;if(!prof||!prof.hoat_dong){started=false;$('naText').textContent=prof?'Tài khoản đang chờ quản trị app duyệt. Khi được duyệt, anh/chị đăng nhập lại là dùng được.':'Tài khoản của anh/chị chưa được cấp quyền dùng app kiểm tra hồ sơ bệnh án. Nhờ quản trị app thêm ở tab “Tài khoản”.';screen('scrNoAccess');return}
  isManager=prof.vai_tro==='quan_tri';
  $('tabCanBo').hidden=!isManager;$('meName').textContent=prof.ho_ten||me.email;
  screen('scrApp');
  fillMonths();route();
  loadNames();loadLoi();loadMonth();subscribeRealtime();
}

/* ---------- Tên cán bộ ---------- */
let profilesAll=[];
async function loadNames(){const {data}=await sb.from('hsba_tai_khoan').select('user_id,ho_ten,email,vai_tro,hoat_dong,tao_luc').order('ho_ten');profilesAll=data||[];profilesAll.forEach(p=>names[p.user_id]=p.ho_ten);renderList();if(view==='can-bo')renderCanBo()}
const who=id=>id?(names[id]||'Cán bộ'):'';

/* ---------- Tháng ---------- */
function monthOptions(){const out=[];const d=new Date();d.setDate(1);for(let i=0;i<14;i++){out.push(`${d.getFullYear()}-${pad(d.getMonth()+1)}`);d.setMonth(d.getMonth()-1)}return out}
function fillMonths(){$('selThang').innerHTML=monthOptions().map(m=>`<option value="${m}">${ymLabel(m)}</option>`).join('');$('selThang').value=curYM}
$('selThang').addEventListener('change',()=>{curYM=$('selThang').value;selected.clear();loadMonth()});

/* ---------- Tải dữ liệu ---------- */
async function loadMonth(){
  recs=new Map();renderList();$('loading').hidden=false;$('loading').textContent='Đang tải dữ liệu…';
  try{const rows=await fetchRange(curYM+'-01',lastDay(curYM));recs=new Map(rows.map(r=>{const x=fromRow(r);return [x.k,x]}));$('loading').hidden=true;}
  catch(e){$('loading').textContent='Không tải được dữ liệu: '+(e.message||e)}
  renderList();if(view==='dashboard')renderStats();
}
function subscribeRealtime(){
  sb.channel('hsba').on('postgres_changes',{event:'*',schema:'public',table:'hsba_ho_so'},p=>{
    if(p.eventType==='DELETE'){recs.delete(String(p.old.id));}
    else{const r=fromRow(p.new);if(r.ngayRa.startsWith(curYM))recs.set(r.k,r);else recs.delete(r.k)}
    scheduleRender();
  }).subscribe();
}
let rq;function scheduleRender(){cancelAnimationFrame(rq);rq=requestAnimationFrame(()=>{renderList();if(openK&&recs.get(openK))fillDrawerMeta(recs.get(openK))})}
async function saveRec(r,patch){const {error}=await sb.from('hsba_ho_so').update(toPatch(patch)).eq('id',r.id);if(error)throw error;recs.set(r.k,{...r,...patch})}
function writeErr(e){return 'Không lưu được: '+(e&&e.message||'lỗi không rõ')}

/* ---------- Danh sách ---------- */
function filtered(){
  const q=filt.q.trim().toLowerCase();
  return [...recs.values()].filter(r=>(!filt.khoa||r.khoa===filt.khoa)&&(!filt.st||stOf(r)===filt.st)&&(!q||(r.hoTen||'').toLowerCase().includes(q)||(r.ma||'').includes(q)))
   .sort((a,b)=>(a.khoa||'').localeCompare(b.khoa||'','vi')||(b.ngayRa||'').localeCompare(a.ngayRa||'')||String(b.ma).localeCompare(String(a.ma)));
}
function renderList(){
  const all=[...recs.values()];
  const khoas=[...new Set(all.map(r=>r.khoa))].sort((a,b)=>a.localeCompare(b,'vi'));
  const v=$('fKhoa').value;$('fKhoa').innerHTML='<option value="">Tất cả khoa</option>'+khoas.map(k=>`<option>${esc(k)}</option>`).join('');$('fKhoa').value=khoas.includes(v)?v:'';filt.khoa=$('fKhoa').value;
  const base=all.filter(r=>!filt.khoa||r.khoa===filt.khoa);
  const cnt={chua:0,dat:0,khong:0};base.forEach(r=>cnt[stOf(r)]++);
  $('chips').innerHTML=`<button class="chip" data-st="" aria-pressed="${!filt.st}">Tất cả <b>${base.length}</b></button>`+
    Object.keys(ST).map(k=>`<button class="chip" data-st="${k}" aria-pressed="${filt.st===k}"><span class="sw" style="background:${STC[k]}"></span>${ST[k]} <b>${cnt[k]}</b></button>`).join('');
  const rows=filtered();const tb=$('tbody');
  if(!all.length){tb.innerHTML=`<tr><td colspan="13" class="empty">Chưa có hồ sơ ra viện nào trong ${ymLabel(curYM).toLowerCase()}.<br>Bấm <b>Nhập danh sách ra viện từ HIS</b> để lấy danh sách.</td></tr>`;updBulk();return}
  if(!rows.length){tb.innerHTML=`<tr><td colspan="13" class="empty">Không có hồ sơ phù hợp bộ lọc.</td></tr>`;updBulk();return}
  const html=[];let lastK=null;const nBy={};rows.forEach(r=>nBy[r.khoa]=(nBy[r.khoa]||0)+1);
  let stt=0;
  rows.forEach(r=>{
    if(r.khoa!==lastK){lastK=r.khoa;stt=0;html.push(`<tr class="grp"><td colspan="13">${esc(r.khoa||'Chưa rõ khoa')} - ${nBy[r.khoa]} NB</td></tr>`)}
    stt++;const loi=[...(r.loi||[]),r.ghiChu].filter(Boolean).join('; ');
    const dt=s=>{if(!s)return '';const [d,t]=String(s).split(' ');return `${fmtD(d)}${t?'<div class="muted" style="font-size:12px">'+esc(t)+'</div>':''}`};
    html.push(`<tr class="row${selected.has(r.k)?' sel':''}" data-k="${r.k}">
      <td><input type="checkbox" data-chk="${r.k}" ${selected.has(r.k)?'checked':''} aria-label="Chọn ${esc(r.ma)}"></td>
      <td class="num">${stt}</td><td class="mono">${esc(r.ma)}</td>
      <td style="font-weight:600">${r.hoTen?esc(r.hoTen.toUpperCase()):'<span class="muted" style="font-weight:400">Dữ liệu cũ</span>'}</td>
      <td class="mono">${esc(r.namSinh||'')}</td><td>${esc(r.gioi||'')}</td><td class="dc">${esc(r.diaChi||'')}</td>
      <td class="mono">${dt(r.ngayVao)}</td><td class="mono">${dt(r.ngayRa)}</td><td>${esc(r.huong||'')}</td>
      <td><label class="nhan"><input type="checkbox" data-nhan="${r.k}" ${r.giao==='dat'?'checked':''} aria-label="Đã kiểm nhận ${esc(r.ma)}"><span class="muted">${r.giao==='dat'?fmtD(r.ngayGiao):'Chưa nhận'}</span></label></td>
      <td>${r.danhGia?`<span class="st ${r.danhGia}">${r.danhGia==='dat'?'Đạt':'Không đạt'}</span>`:'<span class="st chua">Chưa đánh giá</span>'}</td>
      <td class="loi-mini">${esc(loi)}</td></tr>`);
  });
  tb.innerHTML=html.join('');updBulk();
}
$('chips').addEventListener('click',e=>{const b=e.target.closest('[data-st]');if(!b)return;filt.st=b.dataset.st;renderList()});
$('fKhoa').addEventListener('change',()=>{filt.khoa=$('fKhoa').value;renderList()});
$('q').addEventListener('input',()=>{filt.q=$('q').value;renderList()});
$('tbody').addEventListener('click',async e=>{
  const nh=e.target.closest('[data-nhan]');if(nh){const r=recs.get(nh.dataset.nhan);if(!r)return;const on=nh.checked;nh.disabled=true;
    const p=on?{giao:'dat',ngay_giao:today(),nguoi_kt:me.id,cap_nhat_luc:new Date().toISOString()}:{giao:null,ngay_giao:null,cap_nhat_luc:new Date().toISOString()};
    const {error}=await sb.from('hsba_ho_so').update(p).eq('id',r.id);nh.disabled=false;
    if(error){nh.checked=!on;toast(writeErr(error));return}
    r.giao=p.giao;r.ngayGiao=p.ngay_giao;toast((on?'Đã kiểm nhận ':'Đã bỏ kiểm nhận ')+r.ma);renderList();return}
  if(e.target.closest('label.nhan'))return;
  const c=e.target.closest('[data-chk]');if(c){c.checked?selected.add(c.dataset.chk):selected.delete(c.dataset.chk);c.closest('tr').classList.toggle('sel',c.checked);updBulk();return}
  const tr=e.target.closest('tr.row');if(tr)openDrawer(tr.dataset.k);
});
$('chkAll').addEventListener('change',e=>{filtered().forEach(r=>e.target.checked?selected.add(r.k):selected.delete(r.k));renderList()});
function updBulk(){const n=[...selected].filter(m=>recs.has(m)).length;$('bulk').hidden=!n;$('bulkN').textContent=`Đã chọn ${n} hồ sơ`}
$('bulk').addEventListener('click',async e=>{const b=e.target.closest('[data-bulk]');if(!b)return;const a=b.dataset.bulk;
  if(a==='clear'){selected.clear();$('chkAll').checked=false;renderList();return}
  const list=[...selected].map(k=>recs.get(k)).filter(Boolean);const ids={giao:[],danhgia:[]};
  list.forEach(r=>{if(a==='giao'&&!r.giao)ids.giao.push(r.id);if(a==='danhgia'&&!r.danhGia)ids.danhgia.push(r.id)});
  b.disabled=true;const now=new Date().toISOString();let err=null;
  try{
    if(a==='danhgia'&&ids.danhgia.length){
      const chuaGiao=list.filter(r=>!r.danhGia&&!r.giao).map(r=>r.id);
      if(chuaGiao.length){const {error}=await sb.from('hsba_ho_so').update({giao:'dat',ngay_giao:today()}).in('id',chuaGiao);if(error)throw error}
      const {error}=await sb.from('hsba_ho_so').update({danh_gia:'dat',nguoi_kt:me.id,cap_nhat_luc:now}).in('id',ids.danhgia);err=error}
  }catch(x){err=x}
  b.disabled=false;
  if(err){toast(writeErr(err));return}
  const n=a==='giao'?ids.giao.length:ids.danhgia.length;selected.clear();$('chkAll').checked=false;toast(`Đã cập nhật ${n} hồ sơ`);loadMonth();
});

/* ---------- Quét mã ---------- */
$('scanForm').addEventListener('submit',async e=>{e.preventDefault();const v=$('scan').value.replace(/\D/g,'');if(!v)return;
  const exact=[...recs.values()].filter(r=>r.ma===v);
  const hit=exact.length?exact:[...recs.values()].filter(r=>r.ma.endsWith(v));
  if(hit.length===1){openDrawer(hit[0].k);$('scan').value='';return}
  if(hit.length>1){toast(`Có ${hit.length} hồ sơ khớp, gõ thêm số`);return}
  // tìm ở các tháng khác
  const {data}=await sb.from('hsba_ho_so').select(COLS()).eq('ma',v).order('ngay_ra',{ascending:false}).limit(1);
  if(data&&data.length){const r=fromRow(data[0]);curYM=r.ngayRa.slice(0,7);if(![...$('selThang').options].some(o=>o.value===curYM))$('selThang').insertAdjacentHTML('beforeend',`<option value="${curYM}">${ymLabel(curYM)}</option>`);$('selThang').value=curYM;await loadMonth();openDrawer(r.k);$('scan').value='';}
  else toast(`Không thấy mã ${v}. Kiểm tra lại hoặc nhập danh sách ra viện từ HIS.`);
});

/* ---------- Ngăn sửa hồ sơ ---------- */
let openK=null,draft=null;
function openDrawer(k){
  const r=recs.get(k);if(!r)return;openK=k;draft={giao:r.giao||'',ngayGiao:r.ngayGiao||'',danhGia:r.danhGia||'',loi:[...(r.loi||[])],ghiChu:r.ghiChu||''};
  if(!draft.danhGia){draft.danhGia=draft.loi.length?'khong':'dat';if(!draft.giao){draft.giao='dat';draft.ngayGiao=draft.ngayGiao||today()}}
  $('dTitle').textContent=r.hoTen||'Hồ sơ '+r.ma;$('dSub').textContent=r.ma;
  $('dInfo').innerHTML=[['Khoa',r.khoa],['Năm sinh',r.namSinh],['Giới tính',r.gioi],['Địa chỉ',r.diaChi],['Ngày vào',fmtD(r.ngayVao)],['Ngày ra',fmtD(r.ngayRa)],['Hướng điều trị',r.huong],['Nguồn',r.nguon==='Google Sheet'?'Dữ liệu cũ từ Google Sheet':'HIS']].filter(x=>x[1]).map(([a,b])=>`<dt>${a}</dt><dd>${esc(b)}</dd>`).join('');
  $('dGhiChu').value=draft.ghiChu;$('dErr').textContent='';
  fillDrawer();fillDrawerMeta(r);
  $('drawer').hidden=false;$('scrim').hidden=false;$('segDG').querySelector('button').focus();
}
function fillDrawerMeta(r){$('dMeta').textContent=r.capNhatLuc?`Cập nhật lần cuối ${new Date(r.capNhatLuc).toLocaleString('vi-VN')}${r.nguoiKT?' bởi '+who(r.nguoiKT):''}`:'Chưa có cập nhật'}
function fillDrawer(){
  $('segDG').querySelectorAll('button').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.v===draft.danhGia)));
  const all=[...new Set([...loiDM.map(l=>l.ten),...draft.loi])];
  $('dTags').innerHTML=all.length?all.map(t=>`<button type="button" class="tag" data-tag="${esc(t)}" aria-pressed="${draft.loi.includes(t)}">${esc(t)}</button>`).join(''):'<span class="muted">Danh mục lỗi đang trống.</span>';
}
$('segDG').addEventListener('click',e=>{const b=e.target.closest('button');if(!b)return;draft.danhGia=b.dataset.v;if(draft.danhGia&&!draft.giao){draft.giao='dat';draft.ngayGiao=draft.ngayGiao||today()}
  $('dErr').textContent=draft.danhGia==='dat'&&draft.loi.length?'Hồ sơ đang có lỗi được chọn mà đánh giá Đạt. Kiểm tra lại nếu cần.':'';fillDrawer()});
$('dTags').addEventListener('click',e=>{const b=e.target.closest('[data-tag]');if(!b)return;const t=b.dataset.tag;draft.loi=draft.loi.includes(t)?draft.loi.filter(x=>x!==t):[...draft.loi,t];
  draft.danhGia=draft.loi.length?'khong':'dat';if(!draft.giao){draft.giao='dat';draft.ngayGiao=draft.ngayGiao||today()}$('dErr').textContent='';fillDrawer()});
$('dSave').addEventListener('click',async()=>{
  draft.ghiChu=$('dGhiChu').value.trim();const r=recs.get(openK);
  const g=draft.danhGia?(draft.giao||'dat'):(draft.giao||null);const patch={giao:g,ngayGiao:g?(draft.ngayGiao||today()):null,danhGia:draft.danhGia||null,loi:draft.loi,ghiChu:draft.ghiChu,capNhatLuc:new Date().toISOString(),nguoiKT:me.id};
  $('dSave').disabled=true;
  try{await saveRec(r,patch);toast('Đã lưu hồ sơ '+r.ma);closeAll();renderList();$('scan').focus()}catch(e){$('dErr').textContent=writeErr(e)}
  $('dSave').disabled=false;
});
function closeAll(){$('drawer').hidden=true;$('imp').hidden=true;$('scrim').hidden=true;openK=null}
document.querySelectorAll('[data-close]').forEach(b=>b.addEventListener('click',closeAll));
$('scrim').addEventListener('click',closeAll);
document.addEventListener('keydown',e=>{if(e.key==='Escape'&&!$('scrim').hidden)closeAll()});

/* ---------- Nhập từ HIS ---------- */
let parsed=[];
function loadScript(src){return new Promise((ok,no)=>{if(document.querySelector(`script[src="${src}"]`)){ok();return}const s=document.createElement('script');s.src=src;s.onload=ok;s.onerror=()=>no(new Error('Không tải được thư viện đọc file'));document.head.appendChild(s)})}
const PDFJS='https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js',PDFW='https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js',XLSXJS='https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js';
$('btnImport').addEventListener('click',()=>{parsed=[];$('impMsg').innerHTML='';$('impPrev').hidden=true;$('impGo').disabled=true;$('file').value='';$('imp').hidden=false;$('scrim').hidden=false});
$('file').addEventListener('change',()=>{const f=$('file').files[0];if(f)readFile(f)});
const drop=$('drop');['dragover','dragenter'].forEach(t=>drop.addEventListener(t,e=>{e.preventDefault();drop.classList.add('over')}));
['dragleave','drop'].forEach(t=>drop.addEventListener(t,e=>{e.preventDefault();drop.classList.remove('over')}));
drop.addEventListener('drop',e=>{const f=e.dataTransfer.files[0];if(f)readFile(f)});
async function readFile(f){
  $('impMsg').innerHTML='<span class="muted">Đang đọc file…</span>';$('impPrev').hidden=true;$('impGo').disabled=true;
  try{
    const buf=await f.arrayBuffer();
    if(/\.pdf$/i.test(f.name)){
      await loadScript(PDFJS);pdfjsLib.GlobalWorkerOptions.workerSrc=PDFW;
      const doc=await pdfjsLib.getDocument({data:new Uint8Array(buf),isEvalSupported:false,verbosity:0}).promise;const pages=[];
      for(let p=1;p<=doc.numPages;p++){const pg=await doc.getPage(p);const tc=await pg.getTextContent();pages.push({w:pg.view[2],items:tc.items.map(i=>({x:i.transform[4],y:i.transform[5],h:i.height,s:i.str}))})}
      parsed=parseHisPages(pages);
    }else{
      await loadScript(XLSXJS);const wb=XLSX.read(buf,{type:'array'});parsed=parseSheet(XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]],{header:1,raw:false,defval:''}));
    }
    showPreview();
  }catch(e){$('impMsg').innerHTML=`<span class="err">Không đọc được file: ${esc(e.message||e)}. Hãy dùng đúng file in từ báo cáo KHTH08.1.</span>`}
}
function normDate(s){s=String(s||'').trim();let m=s.match(/(\d{1,2})\/(\d{1,2})\/(\d{4})\s*(\d{1,2}:\d{2})?/);if(m)return `${m[3]}-${pad(m[2])}-${pad(m[1])}${m[4]?' '+m[4].padStart(5,'0'):''}`;m=s.match(/(\d{4})-(\d{2})-(\d{2})/);return m?m[0]:''}
function parseSheet(rows){
  const hi=rows.findIndex(r=>r.some(c=>/mã\s*(hồ sơ|vào viện|bệnh án|ba)/i.test(c))&&r.some(c=>/ngày\s*ra/i.test(c)));
  if(hi<0)throw new Error('không tìm thấy dòng tiêu đề có cột “Mã hồ sơ” và “Ngày ra”');
  const H=rows[hi].map(c=>String(c).toLowerCase());const ix=re=>H.findIndex(c=>re.test(c));
  const c={ma:ix(/mã\s*(hồ sơ|vào viện|bệnh án|ba)/),ten:ix(/họ.*tên/),ns:ix(/năm sinh|ngày sinh/),gt:ix(/giớ/),khoa:ix(/^khoa/),vao:ix(/ngày\s*vào/),ra:ix(/ngày\s*ra/),h:ix(/hướng/)};
  const out=[];let khoa='';
  rows.slice(hi+1).forEach(r=>{const first=String(r.find(x=>String(x).trim())||'').trim();
    const m=first.match(/^(.*\S)\s*-\s*\d+\s*NB\s*$/);if(m&&!/^Tổng/.test(first)){khoa=m[1];return}
    const ma=String(r[c.ma]||'').replace(/\D/g,'');if(!ma||ma.length<6)return;
    out.push({ma,hoTen:String(r[c.ten]||'').trim(),namSinh:String(r[c.ns]??'').trim(),gioi:String(r[c.gt]??'').trim(),khoa:c.khoa>=0&&r[c.khoa]?String(r[c.khoa]).trim():khoa,ngayVao:normDate(r[c.vao]),ngayRa:normDate(r[c.ra]),huong:String(r[c.h]??'').replace(/\s+/g,' ').trim()});});
  return out;
}
function showPreview(){
  parsed=parsed.filter(r=>r.ma&&r.ngayRa);
  if(!parsed.length){$('impMsg').innerHTML='<span class="err">Không tìm thấy người bệnh nào trong file.</span>';return}
  const byM={};parsed.forEach(r=>{const ym=r.ngayRa.slice(0,7);byM[ym]=(byM[ym]||0)+1});
  const khoaN=new Set(parsed.map(r=>r.khoa)).size;
  $('impMsg').innerHTML=`Đọc được <b>${parsed.length}</b> người bệnh ra viện thuộc <b>${khoaN}</b> khoa (${Object.entries(byM).map(([m,n])=>`${ymLabel(m).toLowerCase()}: ${n}`).join(', ')}). Kiểm tra nhanh vài dòng bên dưới rồi bấm thêm.`;
  $('impPrev').innerHTML=`<table><thead><tr><th>Mã hồ sơ</th><th>Họ tên</th><th>Khoa</th><th>Ngày ra</th><th>Hướng ĐT</th></tr></thead><tbody>`+
    parsed.map(r=>`<tr><td class="mono">${esc(r.ma)}</td><td>${esc(r.hoTen)}</td><td>${esc(r.khoa)}</td><td class="mono">${fmtD(r.ngayRa)}</td><td>${esc(r.huong)}</td></tr>`).join('')+'</tbody></table>';
  $('impPrev').hidden=false;$('impGo').disabled=false;
}
$('impGo').addEventListener('click',async()=>{
  const b=$('impGo');b.disabled=true;
  const rows=parsed.map(r=>({ma:r.ma,ngay_ra:r.ngayRa.slice(0,10),gio_ra:r.ngayRa.slice(11)||null,ho_ten:r.hoTen,nam_sinh:r.namSinh,gioi:r.gioi,khoa:r.khoa,ngay_vao:r.ngayVao,huong:r.huong,nguoi_nhap:me.id,nguon:'HIS',...(coDiaChi?{dia_chi:r.diaChi||null}:{})}));
  try{
    for(let i=0;i<rows.length;i+=500){const {error}=await sb.from('hsba_ho_so').upsert(rows.slice(i,i+500),{onConflict:'ma,ngay_ra'});if(error)throw error;b.textContent=`Đang lưu ${Math.min(i+500,rows.length)}/${rows.length}…`}
    toast(`Đã nhập ${rows.length} hồ sơ ra viện`);closeAll();
    const ms=[...new Set(rows.map(r=>r.ngay_ra.slice(0,7)))];
    if(ms.length===1&&ms[0]!==curYM){curYM=ms[0];if(![...$('selThang').options].some(o=>o.value===curYM))$('selThang').insertAdjacentHTML('beforeend',`<option value="${curYM}">${ymLabel(curYM)}</option>`);$('selThang').value=curYM}
    loadMonth();
  }catch(e){$('impMsg').innerHTML=`<span class="err">${esc(writeErr(e))}</span>`}
  b.textContent='Thêm vào danh sách';b.disabled=false;
});

/* ---------- Dashboard ---------- */
function kyMonths(){const k=$('selKy').value;const [y,m]=curYM.split('-').map(Number);
  if(k==='m')return [curYM];if(k==='q'){const s=Math.floor((m-1)/3)*3+1;return [0,1,2].map(i=>`${y}-${pad(s+i)}`)}
  return Array.from({length:12},(_,i)=>`${y}-${pad(i+1)}`)}
let statRows=[];let statSeq=0;
async function renderStats(){
  const ms=kyMonths();const seq=++statSeq;
  $('kyNote').textContent=ms.length===1?ymLabel(ms[0]):`${ymLabel(ms[0])} đến ${ymLabel(ms[ms.length-1]).replace('Tháng ','tháng ')} · đang tải…`;
  let rows;
  if(ms.length===1)rows=[...recs.values()];
  else{try{rows=(await fetchRange(ms[0]+'-01',lastDay(ms[ms.length-1]),COLS())).map(fromRow)}catch(e){$('kyNote').textContent='Không tải được: '+e.message;return}}
  if(seq!==statSeq)return;
  $('kyNote').textContent=ms.length===1?ymLabel(ms[0]):`${ymLabel(ms[0])} đến ${ymLabel(ms[ms.length-1]).replace('Tháng ','tháng ')}`;
  statRows=rows;
  const n=rows.length,dg=rows.filter(r=>r.danhGia).length,kd=rows.filter(r=>r.danhGia==='khong').length,dat=dg-kd;
  const t=new Date(today());const old=rows.filter(r=>!r.danhGia&&r.ngayRa&&(t-new Date(r.ngayRa.slice(0,10)))/864e5>7);
  $('kpis').innerHTML=[['Người bệnh ra viện',n.toLocaleString('vi-VN'),''],['Đã đánh giá',dg.toLocaleString('vi-VN'),fmtP(pct(dg,n))+' số ra viện'],['Tỷ lệ đạt',fmtP(pct(dat,dg)),`${dat.toLocaleString('vi-VN')} đạt · ${kd.toLocaleString('vi-VN')} không đạt`],['Chưa đánh giá quá 7 ngày',old.length,'tính đến hôm nay']]
    .map(([k,v,s])=>`<div class="kpi"><div class="k">${k}</div><div class="v">${v}</div><div class="s">${s}</div></div>`).join('');
  drawTrend(rows,ms);
  const byK=groupKhoa(rows);
  const bar=p=>{const c=p==null?'':p<70?'b':p<90?'w':'';return `<div class="bar"><div class="t"><i class="${c}" style="width:${p||0}%"></i></div><span>${fmtP(p)}</span></div>`};
  const kr=Object.entries(byK).sort((a,b)=>a[0].localeCompare(b[0],'vi'));
  $('tblKhoa').querySelector('tbody').innerHTML=kr.length?kr.map(([k,o])=>`<tr><td>${esc(k)}</td><td class="num">${o.n}</td><td class="num">${o.d}</td><td style="min-width:140px">${bar(pct(o.d,o.n))}</td><td class="num">${o.k}</td><td style="min-width:140px">${bar(pct(o.d-o.k,o.d))}</td></tr>`).join(''):`<tr><td colspan="6" class="empty">Chưa có dữ liệu trong kỳ này.</td></tr>`;
  const ec={};rows.forEach(r=>(r.loi||[]).forEach(l=>ec[l]=(ec[l]||0)+1));const top=Object.entries(ec).sort((a,b)=>b[1]-a[1]).slice(0,10);const mx=top.length?top[0][1]:1;
  $('errs').innerHTML=top.length?top.map(([l,c])=>`<li><span>${esc(l)}</span><div class="t"><i style="width:${c/mx*100}%"></i></div><span class="n">${c}</span></li>`).join(''):'<li class="muted">Chưa ghi nhận lỗi nào trong kỳ này.</li>';
  const od={};old.forEach(r=>od[r.khoa]=(od[r.khoa]||0)+1);
  $('overdue').innerHTML=old.length?`<table><tbody>${Object.entries(od).sort((a,b)=>b[1]-a[1]).map(([k,c])=>`<tr><td>${esc(k)}</td><td class="num" style="font-weight:700;color:var(--warn)">${c}</td></tr>`).join('')}</tbody></table>`:'<p class="muted" style="margin:0">Không có hồ sơ nào chưa đánh giá quá 7 ngày.</p>';
}
function groupKhoa(rows){const byK={};rows.forEach(r=>{const o=byK[r.khoa]=byK[r.khoa]||{n:0,g:0,d:0,k:0};o.n++;if(r.danhGia)o.g++;if(r.danhGia)o.d++;if(r.danhGia==='khong')o.k++});return byK}
function drawTrend(rows,ms){
  const byDay=ms.length===1;const [y,m]=ms[0].split('-').map(Number);
  const keys=byDay?Array.from({length:new Date(y,m,0).getDate()},(_,i)=>`${ms[0]}-${pad(i+1)}`):ms;
  const lab=byDay?keys.map(k=>String(+k.slice(8))):keys.map(k=>'T'+(+k.slice(5)));
  const g={};keys.forEach(k=>g[k]={n:0,g:0,d:0,k:0});
  rows.forEach(r=>{const o=g[(r.ngayRa||'').slice(0,byDay?10:7)];if(!o)return;o.n++;if(r.danhGia)o.g++;if(r.danhGia)o.d++;if(r.danhGia==='khong')o.k++});
  $('trendTitle').textContent=byDay?'Diễn biến theo ngày ra viện':'Diễn biến theo tháng';
  $('trendLegend').innerHTML='<span><i style="background:var(--surface-2);outline:1px solid var(--line)"></i>Ra viện</span><span><i style="background:var(--accent)"></i>Đã đánh giá</span><span><i style="background:var(--good);height:3px;vertical-align:3px"></i>Tỷ lệ đạt (%)</span>';
  const svg=$('trend');const W=Math.max(560,svg.clientWidth||800),H=240,L=40,R=40,T=12,B=26;svg.setAttribute('viewBox',`0 0 ${W} ${H}`);
  const max=Math.max(4,...keys.map(k=>g[k].n));const step=Math.ceil(max/4);const top=step*4;
  const cw=(W-L-R)/keys.length,bw=Math.max(3,Math.min(26,cw*0.62));const yv=v=>T+(H-T-B)*(1-v/top),yp=p=>T+(H-T-B)*(1-p/100);
  let s='';for(let i=0;i<=4;i++){const v=step*i,yy=yv(v);s+=`<line class="grid" x1="${L}" x2="${W-R}" y1="${yy}" y2="${yy}"/><text x="${L-6}" y="${yy+4}" text-anchor="end">${v}</text><text x="${W-R+6}" y="${yy+4}">${25*i}%</text>`}
  const pts=[];
  keys.forEach((k,i)=>{const o=g[k];const cx=L+cw*(i+.5);
    if(o.n)s+=`<rect x="${cx-bw/2}" y="${yv(o.n)}" width="${bw}" height="${yv(0)-yv(o.n)}" fill="var(--surface-2)" stroke="var(--line)" rx="2"><title>${lab[i]}: ${o.n} ra viện, ${o.g} đã đánh giá</title></rect>`;
    if(o.g)s+=`<rect x="${cx-bw/2+2}" y="${yv(o.g)}" width="${Math.max(1,bw-4)}" height="${yv(0)-yv(o.g)}" fill="var(--accent)" rx="1.5"/>`;
    if(o.d)pts.push([cx,yp((o.d-o.k)/o.d*100),Math.round((o.d-o.k)/o.d*100)]);
    if(!byDay||i%Math.ceil(keys.length/16)===0)s+=`<text x="${cx}" y="${H-8}" text-anchor="middle">${lab[i]}</text>`;});
  if(pts.length>1)s+=`<polyline points="${pts.map(p=>p[0]+','+p[1]).join(' ')}" fill="none" stroke="var(--good)" stroke-width="2"/>`;
  pts.forEach(p=>s+=`<circle cx="${p[0]}" cy="${p[1]}" r="3" fill="var(--good)"><title>Tỷ lệ đạt ${p[2]}%</title></circle>`);
  if(!rows.length)s+=`<text x="${W/2}" y="${H/2}" text-anchor="middle">Chưa có dữ liệu trong kỳ này</text>`;
  svg.innerHTML=s;
}
$('selKy').addEventListener('change',renderStats);
$('btnExcel').addEventListener('click',async()=>{
  const b=$('btnExcel');b.disabled=true;
  try{
    await loadScript(XLSXJS);
    const rows=statRows.slice().sort((a,b)=>(a.khoa||'').localeCompare(b.khoa||'','vi')||(a.ngayRa||'').localeCompare(b.ngayRa||''));
    const ct=[['Mã hồ sơ','Họ tên','Năm sinh','Giới tính','Địa chỉ','Khoa','Ngày vào','Ngày ra','Hướng điều trị','Kiểm nhận hồ sơ','Đánh giá P.KHTH','Lỗi','Ghi chú','Người kiểm tra']]
      .concat(rows.map(r=>[r.ma,r.hoTen,r.namSinh,r.gioi,r.diaChi,r.khoa,fmtD(r.ngayVao),fmtD(r.ngayRa),r.huong,r.giao==='dat'?'Đã nhận '+fmtD(r.ngayGiao):'Chưa nhận',r.danhGia==='dat'?'Đạt':r.danhGia==='khong'?'Không đạt':'Chưa đánh giá',(r.loi||[]).join('; '),r.ghiChu||'',who(r.nguoiKT)]));
    const byK=groupKhoa(rows);
    const tk=[['Khoa','Ra viện','Đã đánh giá','Tỷ lệ đánh giá (%)','Đạt','Không đạt','Tỷ lệ đạt (%)']].concat(Object.entries(byK).sort((a,b)=>a[0].localeCompare(b[0],'vi')).map(([k,o])=>[k,o.n,o.d,pct(o.d,o.n),o.d-o.k,o.k,pct(o.d-o.k,o.d)]));
    const ec={};rows.forEach(r=>(r.loi||[]).forEach(l=>ec[l]=(ec[l]||0)+1));
    const lo=[['Lỗi','Số hồ sơ']].concat(Object.entries(ec).sort((a,b)=>b[1]-a[1]));
    const wb=XLSX.utils.book_new();
    const add=(d,n,w)=>{const ws=XLSX.utils.aoa_to_sheet(d);ws['!cols']=w.map(x=>({wch:x}));XLSX.utils.book_append_sheet(wb,ws,n)};
    add(tk,'Theo khoa',[44,9,9,13,11,7,10,13]);add(ct,'Chi tiết',[13,26,11,8,36,40,17,17,14,18,14,50,40,20]);add(lo,'Lỗi thường gặp',[60,10]);
    const ms=kyMonths();XLSX.writeFile(wb,`Kiem-tra-HSBA_${ms[0]}${ms.length>1?'_den_'+ms[ms.length-1]:''}.xlsx`);
  }catch(e){toast('Không xuất được file: '+(e.message||e))}
  finally{b.disabled=false}
});

/* ---------- Danh mục lỗi ---------- */
async function loadLoi(){const {data}=await sb.from('hsba_loi').select('*').order('thu_tu').order('id');loiDM=data||[];renderDM();if(openK)fillDrawer()}
function renderDM(){
  $('dmList').innerHTML=loiDM.length?loiDM.map((l,i)=>`<div class="dm-row"><span>${esc(l.ten)}</span><button class="btn small" data-up="${i}" ${i?'':'disabled'} aria-label="Đưa lên">↑</button><button class="btn small danger" data-del="${i}">Xóa</button></div>`).join(''):'<p class="muted">Danh mục đang trống.</p>';
}
$('dmForm').addEventListener('submit',async e=>{e.preventDefault();const v=$('dmNew').value.trim();if(!v||loiDM.some(l=>l.ten===v))return;
  const {error}=await sb.from('hsba_loi').insert({ten:v,thu_tu:(loiDM.at(-1)?.thu_tu||0)+1});if(error){toast(writeErr(error));return}$('dmNew').value='';loadLoi()});
$('dmList').addEventListener('click',async e=>{const d=e.target.closest('[data-del]'),u=e.target.closest('[data-up]');
  if(d){const l=loiDM[+d.dataset.del];const {error}=await sb.from('hsba_loi').delete().eq('id',l.id);if(error)toast(writeErr(error));loadLoi()}
  if(u){const i=+u.dataset.up;const a=loiDM[i-1],b=loiDM[i];const ta=a.thu_tu,tb=b.thu_tu===ta?ta+1:b.thu_tu;
    await sb.from('hsba_loi').update({thu_tu:tb}).eq('id',a.id);await sb.from('hsba_loi').update({thu_tu:ta}).eq('id',b.id);loadLoi()}});

/* ---------- Tài khoản ---------- */
function renderCanBo(){
  const ds=[...profilesAll].sort((x,y)=>(x.hoat_dong-y.hoat_dong)||String(x.ho_ten).localeCompare(y.ho_ten,'vi'));
  $('cbList').innerHTML=ds.length?ds.map(p=>{const self=p.user_id===me.id;
    return `<div class="cb-row"><span>${esc(p.ho_ten)}<div class="muted" style="font-size:12px">${esc(p.email||'')}${p.hoat_dong?'':' · <b>chờ duyệt / đã khoá</b>'}</div></span>
      <select data-vai="${p.user_id}" ${self?'disabled':''} aria-label="Vai trò"><option value="can_bo" ${p.vai_tro==='can_bo'?'selected':''}>Cán bộ</option><option value="quan_tri" ${p.vai_tro==='quan_tri'?'selected':''}>Quản trị</option></select>
      ${self?'':`<button class="btn small ${p.hoat_dong?'':'primary'}" type="button" data-khoa="${p.user_id}">${p.hoat_dong?'Khoá':'Duyệt'}</button>`}</div>`}).join(''):'<div class="cb-row muted">Chưa có tài khoản.</div>';
}
$('cbList').addEventListener('change',async e=>{const s=e.target.closest('[data-vai]');if(!s)return;
  const {error}=await sb.from('hsba_tai_khoan').update({vai_tro:s.value}).eq('user_id',s.dataset.vai);
  if(error){toast(writeErr(error))}else toast('Đã đổi vai trò của '+names[s.dataset.vai]);loadNames()});
$('cbList').addEventListener('click',async e=>{const k=e.target.closest('[data-khoa]');if(!k)return;
  const tk=profilesAll.find(x=>x.user_id===k.dataset.khoa);const {error}=await sb.from('hsba_tai_khoan').update({hoat_dong:!tk.hoat_dong}).eq('user_id',tk.user_id);
  if(error)toast(writeErr(error));else toast((tk.hoat_dong?'Đã khoá ':'Đã duyệt ')+tk.ho_ten);loadNames()});
$('tkForm').addEventListener('submit',async e=>{e.preventDefault();$('tkErr').textContent='';$('tkBtn').disabled=true;
  const {data,error}=await sb.rpc('hsba_them_theo_email',{p_email:$('tkEmail').value,p_ho_ten:$('tkTen').value,p_vai_tro:$('tkVai').value});
  if(error)$('tkErr').textContent=error.message;
  else if(data==='khong_co')$('tkErr').textContent='Email này chưa có tài khoản. Nhờ người đó bấm “Đăng ký” ở trang đăng nhập, rồi duyệt ở danh sách trên.';
  else{toast('Đã thêm '+$('tkTen').value);$('tkForm').reset();loadNames()}
  $('tkBtn').disabled=false});

/* ---------- Nạp dữ liệu cũ ---------- */
$('legacyGo').addEventListener('click',async()=>{
  const f=$('legacyFile').files[0];if(!f){$('legacyMsg').textContent='Chọn file trước.';return}
  const b=$('legacyGo');b.disabled=true;
  try{
    const rows=JSON.parse(await f.text());if(!Array.isArray(rows))throw new Error('File không đúng định dạng');
    for(let i=0;i<rows.length;i+=500){const {error}=await sb.from('hsba_ho_so').upsert(rows.slice(i,i+500),{onConflict:'ma,ngay_ra'});if(error)throw error;
      $('legacyMsg').textContent=`Đang nạp ${Math.min(i+500,rows.length).toLocaleString('vi-VN')}/${rows.length.toLocaleString('vi-VN')} hồ sơ…`}
    $('legacyMsg').textContent=`Đã nạp xong ${rows.length.toLocaleString('vi-VN')} hồ sơ.`;loadMonth();
  }catch(e){$('legacyMsg').textContent='Lỗi: '+(e.message||e)}
  b.disabled=false;
});

/* ---------- Điều hướng ---------- */
function route(){const h=location.hash.slice(1);const ok=['ho-so','dashboard','danh-muc'].concat(isManager?['can-bo']:[]);view=ok.includes(h)?h:'ho-so';
  document.querySelectorAll('[data-view]').forEach(s=>s.hidden=s.dataset.view!==view);
  document.querySelectorAll('nav.tabs a').forEach(a=>a.dataset.tab===view?a.setAttribute('aria-current','page'):a.removeAttribute('aria-current'));
  if(view==='dashboard')renderStats();if(view==='can-bo')renderCanBo();}
window.addEventListener('hashchange',route);

start();
})();
