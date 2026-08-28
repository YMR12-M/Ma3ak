/* ============================================
   MA3ak (معاك) - كاش صور الأدوية

   الصورة بتتجاب كـ data URL جوه JSON مش كملف عادي، لأن وسم <img> مش بيقدر
   يبعت هيدر Authorization والمسار محمي (شوف backend/routes/medications.js).
   يعني مفيش كاش من المتصفح مجانًا - لازم نكاشها إحنا.

   طبقتين:
     • ذاكرة (Map) - عشان إعادة الرسم متعملش طلب جديد كل مرة.
     • localStorage - عشان الصورة تفضل موجودة بعد إعادة فتح التطبيق، وتبان
       **والنت قاطع** كمان. ودي مش تفصيلة: المريض اللي بيعتمد على شكل الشريط
       عشان يعرف الدوا، لو الصورة مبانتش يبقى فضل معاه الاسم العلمي وبس - وهو
       اللي أصلاً مش بيقراه.
   ============================================ */

const MED_IMAGE_PREFIX = 'ma3ak_medimg_';
// سقف عدد الصور المحفوظة على الجهاز. localStorage حوالي 5 ميجا، والصورة
// المصغّرة ~60 كيلو - 12 صورة مساحة آمنة تغطي مريض بأدوية كتير.
const MED_IMAGE_MAX_CACHED = 12;

const memoryCache = new Map();

function storageKey(medicationId) {
  return MED_IMAGE_PREFIX + medicationId;
}

function readStored(medicationId) {
  try {
    return localStorage.getItem(storageKey(medicationId));
  } catch (e) {
    return null;
  }
}

/* بيكتب الصورة، وبيفضي مكان لو التخزين اتملى. الصور أكبر حاجة بنخزّنها،
   فلو سبناها تتراكم هتزاحم حاجات أهم (توكن الدخول، طابور الجرعات). */
function writeStored(medicationId, dataUrl) {
  try {
    const keys = Object.keys(localStorage).filter((k) => k.startsWith(MED_IMAGE_PREFIX));
    if (keys.length >= MED_IMAGE_MAX_CACHED) {
      keys.slice(0, keys.length - MED_IMAGE_MAX_CACHED + 1).forEach((k) => localStorage.removeItem(k));
    }
    localStorage.setItem(storageKey(medicationId), dataUrl);
  } catch (e) {
    /* التخزين مليان أو مقفول - الصورة هتفضل في الذاكرة للجلسة دي بس */
  }
}

/* بيجيب صورة دوا. بيرجّع data URL أو null.
   عمرها ما بترمي: صورة مش موجودة أو النت قاطع مش سبب إن الشاشة تقع. */
async function getMedImage(medicationId) {
  if (memoryCache.has(medicationId)) return memoryCache.get(medicationId);

  const stored = readStored(medicationId);
  if (stored) {
    memoryCache.set(medicationId, stored);
    return stored;
  }

  try {
    const data = await api.getMedicationImage(medicationId);
    if (data && data.dataUrl) {
      memoryCache.set(medicationId, data.dataUrl);
      writeStored(medicationId, data.dataUrl);
      return data.dataUrl;
    }
  } catch (e) {
    /* مفيش صورة، أو مفيش نت */
  }
  memoryCache.set(medicationId, null); // منحاولش تاني في نفس الجلسة
  return null;
}

function clearMedImage(medicationId) {
  memoryCache.delete(medicationId);
  try {
    localStorage.removeItem(storageKey(medicationId));
  } catch (e) {
    /* مش مهم */
  }
}

/* بيصغّر صورة اختارها المستخدم قبل ما تترفع.

   ليه على الجهاز مش على السيرفر: صورة من كاميرا موبايل حديث 3-8 ميجا. رفعها
   زي ما هي على بيانات موبايل بطيئة تجربة سيئة (وممكن تفشل خالص)، والسيرفر
   مالوش أي داعي يستقبل الحجم ده عشان يعرضها 200 بكسل في الآخر.

   بيرجّع data URL بصيغة JPEG. */
const MED_IMAGE_MAX_DIMENSION = 640;
const MED_IMAGE_QUALITY = 0.75;

function resizeImageFile(file) {
  return new Promise((resolve, reject) => {
    if (!file || !file.type.startsWith('image/')) {
      reject(new Error('لازم تختار صورة'));
      return;
    }
    const reader = new FileReader();
    reader.onerror = () => reject(new Error('مقدرناش نقرا الصورة'));
    reader.onload = () => {
      const img = new Image();
      img.onerror = () => reject(new Error('الملف ده مش صورة سليمة'));
      img.onload = () => {
        const scale = Math.min(1, MED_IMAGE_MAX_DIMENSION / Math.max(img.width, img.height));
        const canvas = document.createElement('canvas');
        canvas.width = Math.round(img.width * scale);
        canvas.height = Math.round(img.height * scale);
        const ctx = canvas.getContext('2d');
        /* خلفية بيضا قبل الرسم: الـ JPEG مالوش شفافية، وصورة PNG بخلفية شفافة
           كانت بتطلع بخلفية سودا - وده بيخلي شريط الدوا مش باين. */
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
        resolve(canvas.toDataURL('image/jpeg', MED_IMAGE_QUALITY));
      };
      img.src = reader.result;
    };
    reader.readAsDataURL(file);
  });
}
