/* ============================================
   مطعم خالو — ملف الإعداد والبيانات المشترك
   ============================================ */

/* --------- إعداد Firebase (الطلبات المباشرة عبر الانترنت) --------- */
const FIREBASE_CONFIG = {
  apiKey: "AIzaSyD7CN6amfo_K31-rqwFZPYHw-t2sJjXC_8",
  authDomain: "mt3m-5halo.firebaseapp.com",
  databaseURL: "https://mt3m-5halo-default-rtdb.europe-west1.firebasedatabase.app",
  projectId: "mt3m-5halo",
  storageBucket: "mt3m-5halo.firebasestorage.app",
  messagingSenderId: "643631559160",
  appId: "1:643631559160:web:8d89b4b1fe63a7fefb660d"
};

/* --------- بيانات المطعم --------- */
const RESTAURANT = {
  name: "مطعم خالو",
  phone: "+96407716771881",
  whatsapp: "9647716771881",
  location: "البصرة — أبو الخصيب، مهيجران (مقابل حسينية بني عامر)",
  deliveryFee: 1000,
  currency: "د.ع"
};

/* --------- قائمة الطعام ---------
   ⚠️ القائمة فارغة هنا عمداً — الرجاء إضافة الوجبات من لوحة الأدمن،
   وتُجلب مباشرة من Firebase لكل الزبائن.
   options: نوع خيارات الطبق:
    - fries:   مع جبن أو بدون
    - size:    اختيار الحجم
    - drink:   إضافة مشروب
   img: رابط/صورة الوجبة (اختياري)
--------------------------------------------------------- */
let MENU = [];

const CATS = [
  { id:"all",   name:"الكل" },
  { id:"fast",  name:"🍔 وجبات سريعة" },
  { id:"grill", name:"🔥 مشاوي وشرقيات" },
];

const SIZES  = [ {n:"صغير",p:+0}, {n:"وسط",p:+1500}, {n:"كبير",p:+3000} ];
const DRINKS = [ {n:"بدون",p:0}, {n:"بيبسي",p:1000}, {n:"ميرندا",p:1000}, {n:"ماء",p:500} ];
const FRIES_OPTS = [ {n:"بدون جبن",p:0}, {n:"مع جبن 🧀",p:1000} ];

const fmt = n => n.toLocaleString() + " " + RESTAURANT.currency;

/* --------- Firebase مشترك — اتصال مع 5 محاولات ثم خطأ 401 --------- */
let db = null, online = false;
const DB_MAX_TRIES = 5;
let _dbTries = 0, _dbConnected = false;

function initDB(){
  _dbTries = 0; _dbConnected = false;
  _attempt();
}

function _attempt(){
  _dbTries++;
  try {
    if (typeof firebase === "undefined") throw new Error("SDK failed to load (offline?)");
    if (!firebase.apps.length) firebase.initializeApp(FIREBASE_CONFIG);
    db = firebase.database();
    db.ref(".info/connected").on("value", snap => {
      if (snap.val() === true && !_dbConnected){
        _dbConnected = online = true;
        window.dispatchEvent(new Event("khalo_db_ready"));
      }
    });
    // مهلة المحاولة الواحدة
    setTimeout(() => {
      if (!_dbConnected){
        if (_dbTries < DB_MAX_TRIES) _attempt();
        else _fail401();
      }
    }, 4000);
  } catch (e) {
    if (_dbTries < DB_MAX_TRIES) setTimeout(_attempt, 1500);
    else _fail401();
  }
}

/* عرض خطأ 401 على أي صفحة */
function _fail401(){
  window.dispatchEvent(new Event("khalo_db_fail"));
  const box = document.createElement("div");
  box.id = "err401";
  box.style.cssText = "position:fixed;inset:0;background:rgba(255,255,255,.98);z-index:9999;display:flex;flex-direction:column;justify-content:center;align-items:center;text-align:center;padding:8%;font-family:'Segoe UI',Tahoma,sans-serif";
  box.innerHTML = `
    <div style="font-size:4.5rem">🔌</div>
    <h1 style="color:#d63232;font-size:2.5rem;margin:10px 0">401</h1>
    <h2 style="color:#2b2b2b">تعذّر الاتصال بالخادم</h2>
    <p style="color:#8a8a8a;line-height:2;margin:12px 0 25px;max-width:420px">
      فشل الاتصال بعد ${DB_MAX_TRIES} محاولات.<br>
      تأكد من اتصالك بالإنترنت ثم أعد المحاولة.</p>
    <button onclick="document.getElementById('err401').remove();initDB()"
      style="padding:14px 45px;border:none;border-radius:30px;background:#d63232;color:#fff;font-weight:bold;font-size:1.05rem;cursor:pointer;font-family:inherit">
      🔄 إعادة المحاولة</button>`;
  document.body.appendChild(box);
}

initDB();

/* إرسال طلب جديد */
function sendOrder(order){
  order.id = order.id || ("ORD-" + Date.now());
  order.ts = Date.now();
  order.time = new Date().toLocaleString("ar-IQ");
  order.status = order.status || "جديد";
  if (online) return db.ref("orders/" + order.id).set(order).then(()=>order);
  // لا يوجد اتصال بعد: احفظه محلياً وسيُرسل للسحابة فور عودة الاتصال
  const arr = JSON.parse(localStorage.getItem("khalo_orders")||"[]");
  arr.push(order);
  localStorage.setItem("khalo_orders", JSON.stringify(arr));
  const pend = JSON.parse(localStorage.getItem("khalo_pending_orders")||"[]");
  if (!pend.includes(order.id)) pend.push(order.id);
  localStorage.setItem("khalo_pending_orders", JSON.stringify(pend));
  window.dispatchEvent(new Event("khalo_order"));
  return Promise.resolve(order);
}

/* إرسال الطلبات التي حُفظت محلياً بسبب انقطاع الاتصال → السحابة */
function flushPendingOrders(){
  if (!online) return;
  const pend = JSON.parse(localStorage.getItem("khalo_pending_orders")||"[]");
  if (!pend.length) return;
  const arr = JSON.parse(localStorage.getItem("khalo_orders")||"[]");
  pend.forEach(id => {
    const o = arr.find(x => x.id === id);
    if (o) db.ref("orders/" + id).set(o).catch(()=>{});
  });
  localStorage.removeItem("khalo_pending_orders");
}
window.addEventListener("khalo_db_ready", flushPendingOrders);

/* الاستماع للطلبات (للأدمن) */
function onOrders(cb){
  if (online) {
    db.ref("orders").on("value", snap => {
      const v = snap.val() || {};
      cb(Object.values(v).sort((a,b)=> (b.ts||0) - (a.ts||0)));
    });
  } else {
    const load = ()=> cb(JSON.parse(localStorage.getItem("khalo_orders")||"[]").slice().reverse());
    load();
    window.addEventListener("khalo_order", load);
    window.addEventListener("storage", load);
  }
}

function updateOrderStatus(id, status, reason){
  if (online) {
    const upd = { status };
    if (reason !== undefined) upd.rejectReason = reason;
    return db.ref("orders/" + id).update(upd);
  }
  const arr = JSON.parse(localStorage.getItem("khalo_orders")||"[]");
  const o = arr.find(x=>x.id===id);
  if(o){ o.status=status; if(reason!==undefined) o.rejectReason=reason; }
  localStorage.setItem("khalo_orders", JSON.stringify(arr));
  window.dispatchEvent(new Event("khalo_order"));
  return Promise.resolve();
}

/* أرشفة كل الطلبات (بدء يوم جديد) */
function archiveAllOrders(){
  if (online) {
    return db.ref("orders").once("value").then(snap => {
      const v = snap.val() || {};
      const upd = {};
      Object.keys(v).forEach(k => { if(!v[k].archived) upd[k + "/archived"] = true; });
      return db.ref("orders").update(upd);
    });
  }
  const arr = JSON.parse(localStorage.getItem("khalo_orders")||"[]");
  arr.forEach(o => o.archived = true);
  localStorage.setItem("khalo_orders", JSON.stringify(arr));
  window.dispatchEvent(new Event("khalo_order"));
  return Promise.resolve();
}

/* حذف طلب نهائياً (صلاحية كاملة للأدمن) */
function deleteOrder(id){
  if (online) return db.ref("orders/" + id).remove();
  let arr = JSON.parse(localStorage.getItem("khalo_orders")||"[]");
  arr = arr.filter(o => o.id !== id);
  localStorage.setItem("khalo_orders", JSON.stringify(arr));
  window.dispatchEvent(new Event("khalo_order"));
  return Promise.resolve();
}

/* ✅ الاستماع للطلبات المعلّمة (محلياً) حتى لو لم يجهز الاتصال بعد */
// (مُدمج في onOrders أعلاه عبر حدث khalo_order)

/* ==========================================
   إدارة القائمة عبر Firebase (لوحة الأدمن)
   ========================================== */

/* الاستماع للقائمة مباشرة (للزبون والأدمن والصفحة الرئيسية) */
function onMenu(cb){
  if (online) {
    db.ref("menu").on("value", snap => {
      const v = snap.val() || {};
      cb(Object.values(v));
    });
  } else {
    const load = () => cb(JSON.parse(localStorage.getItem("khalo_menu")||"[]"));
    load();
    window.addEventListener("khalo_menu", load);
    window.addEventListener("storage", load);
    /* عند عودة الاتصال لاحقاً، اجلب القائمة من السحابة تلقائياً */
    window.addEventListener("khalo_db_ready", () => onMenu(cb), { once:true });
  }
}

/* إضافة/تعديل وجبة */
function saveMeal(meal){
  meal.id = meal.id || ("MEAL-" + Date.now());
  if (online) return db.ref("menu/" + meal.id).set(meal).then(()=>meal);
  const arr = JSON.parse(localStorage.getItem("khalo_menu")||"[]");
  const i = arr.findIndex(m => m.id === meal.id);
  if (i >= 0) arr[i] = meal; else arr.push(meal);
  localStorage.setItem("khalo_menu", JSON.stringify(arr));
  window.dispatchEvent(new Event("khalo_menu"));
  return Promise.resolve(meal);
}

/* حذف وجبة */
function deleteMeal(id){
  if (online) return db.ref("menu/" + id).remove();
  let arr = JSON.parse(localStorage.getItem("khalo_menu")||"[]");
  arr = arr.filter(m => m.id !== id);
  localStorage.setItem("khalo_menu", JSON.stringify(arr));
  window.dispatchEvent(new Event("khalo_menu"));
  return Promise.resolve();
}
