# Roadmap Item 7 — User Manual (Turkish, End-User First)

**Priority:** P6 — Adoption and support readiness  
**Estimated effort:** 1–2 engineering days (requirements + outline only)  
**Depends on:** Item 5 (Windows package) and Item 6 (license policy decisions)  
**Blocks:** Clean customer handover and low-support operations

---

## Problem Statement

The application may be technically correct, but real-world success depends on whether
non-technical users can install and operate it without confusion.

Current documentation is engineering-focused. For production rollout, we need a
structured **Turkish user manual requirement set** that ensures:

1. Installation is understandable for non-technical users.
2. Daily operations are repeatable with minimal training.
3. Common problems can be solved without developer intervention.
4. Technical staff still have access to an advanced appendix when needed.

This item defines requirements only. The actual manual will be written later.

---

## Goal

1. Define the full scope of a **Turkish-first user manual** for operators and admins.
2. Define language/UX quality standards so instructions are understandable by any
   non-technical person.
3. Define a separate technical section for installers/support personnel.
4. Define acceptance criteria for readability and handover quality.

---

## Target Audience

### Primary audience

- Otopark görevlisi (operator)
- Site/ofis personeli
- Non-technical business owner

### Secondary audience

- Kurulum yapan teknik personel
- Destek veren geliştirici / sistem sorumlusu

---

## Scope

### In scope (manual must include)

- Kurulum adımları (Windows üzerinde ZIP ile kurulum).
- İlk açılış ve temel ayarlar.
- Kamera/gate ekleme ve doğrulama.
- Günlük kullanım (başlatma, durdurma, giriş/çıkış işlemleri).
- En sık karşılaşılan hatalar ve çözüm adımları.
- Yedekleme ve temel bakım adımları.
- Teknik ek (gelişmiş ayarlar, loglar, performans parametreleri).

### Out of scope (this roadmap item)

- Manual’ın nihai metnini yazmak.
- Video eğitim üretmek.
- UI içindeki metinleri yeniden yazmak.

---

## Documentation Requirements

### R1 — Turkish language quality

- Ana içerik tamamen Türkçe olmalı.
- Cümleler kısa, açık, gündelik dilde olmalı.
- Teknik terim gerekiyorsa sade açıklaması hemen yanında verilmeli.
- "Mühendis dili" ve belirsiz ifadeler kullanılmamalı.

### R2 — Beginner-first structure

Manual must follow this order:

1. Sistem nedir? (1 sayfa, çok kısa)
2. Kurulumdan önce gerekli olanlar
3. Adım adım kurulum
4. İlk açılış ve kontrol listesi
5. Günlük kullanım
6. Sorun giderme
7. Teknik ek

### R3 — Installation clarity (Windows)

Kurulum bölümü açıkça şunları anlatmalı:

- ZIP dosyasını nereye çıkaracağı
- `START.bat` ile başlatma
- `STOP.bat` ile güvenli durdurma
- Tarayıcı açılmazsa `http://localhost:8000` ile manuel erişim
- Defender/uyarı ekranlarında ne yapılacağı

### R4 — Visual support

- Her kritik adım için ekran görüntüsü gereksinimi tanımlanmalı.
- Görseller numaralı adımlarla birebir eşleşmeli.
- "Yanlış/doğru" örnekleri (kamera açısı, plaka görünürlüğü) eklenmeli.

### R5 — Troubleshooting playbook

Manual must include a high-priority issue matrix:

- Uygulama açılmıyor
- Kamera görünmüyor
- Plaka okunmuyor
- Bariyer açılmıyor
- Lisans hatası (Item 6 sonrası)
- Performans yavaşlığı / yüksek CPU

Each issue must have:

- Belirti (kullanıcının gördüğü şey)
- Muhtemel neden
- Adım adım çözüm
- Ne zaman teknik desteğe eskale edilir

### R6 — Technical appendix

A separate section for technical personnel must include:

- `.env` parametrelerinin açıklaması
- Log dosyaları/çıktılarını nasıl okuyacağı
- Performans ayarları (ör. `PROCESS_INTERVAL_SEC`, `PROCESS_WIDTH`)
- Yedekleme/geri yükleme prosedürü
- Sürüm güncelleme prosedürü

### R7 — Accessibility and readability

- Büyük, okunabilir font standardı (PDF/print için).
- Kısa paragraf + madde listesi ağırlıklı yazım.
- Her bölüm sonunda "kısa özet" kutusu.
- Karmaşık işlemler için “Hızlı adımlar” bölümü.

---

## Deliverable Format Requirements

Final manual (later phase) should be produced in at least:

1. **PDF** (müşteriye teslim için)
2. **Markdown source** (version-control ve hızlı güncelleme için)

Optional later:

- Basit tek sayfa "Hızlı Başlangıç Kartı" (printable)

---

## Acceptance Criteria (for requirements phase)

1. Manual scope is fully defined for both non-technical and technical users.
2. Turkish clarity standards are explicit and testable.
3. Installation + troubleshooting sections are mandatory and structured.
4. Technical appendix requirements are clearly separated from end-user flow.
5. A future writer can produce the real manual directly from this spec.

---

## Risks and Mitigations

| Risk | Impact | Mitigation |
|------|--------|------------|
| Manual too technical for operators | High | Beginner-first structure + simple Turkish validation |
| Manual too shallow for technical support | Medium | Dedicated technical appendix requirements |
| Inconsistent updates after new releases | High | Keep markdown source as single truth and version with releases |
| Users skip long manual | Medium | Add quick-start section and issue-based navigation |

---

## Next Step (separate roadmap activity)

After this requirement item is approved:

1. Create real manual draft in Turkish.
2. Validate with one non-technical user (usability read test).
3. Revise unclear sections.
4. Freeze `v1` manual with the release package.
