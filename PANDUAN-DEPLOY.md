# Dashboard Pengurusan Harta dan Fasiliti INSPEN

## Fail

| Fail | Kegunaan |
| --- | --- |
| `index.html` | Halaman dashboard, Tailwind CSS CDN, Inter dan Lucide |
| `style.css` | Susun atur bento, warna, kad, dialog dan navigasi responsif |
| `app.js` | Navigasi, sesi, carian aset, penapis, agihan dan integrasi API |
| `Code.gs` | Akses Google Sheets, pengesahan PIN, kawalan peranan dan operasi baca/tulis |

Buka `index.html` untuk mencuba data contoh. Di **Profil / Staf**, pilih akaun demo untuk mencuba kedua-dua peranan. Perubahan demo berada dalam memori dan direset apabila halaman dimuat semula. Angka, nama staf dan aduan demo ialah contoh.

## 1. Sediakan Google Sheets

1. Cipta satu fail Google Sheets khusus untuk dashboard. Pilih **Extensions → Apps Script**.
2. Gantikan kandungan `Code.gs` di editor dengan fail yang disediakan. Simpan, pilih fungsi **setupSheet**, klik **Run** dan luluskan kebenaran.
3. Fungsi ini mencipta tiga tab dan tajuk lajur, menyimpan ID fail dan menjana rahsia sesi. Jika tab sedia ada mempunyai tajuk berlainan, semak pemetaan sebelum menjalankan semula. Gunakan satu ID unik bagi setiap rekod dan jangan guna semula ID. Baris tanpa ID diabaikan.

| Tab | Lajur mengikut turutan | Contoh baris |
| --- | --- | --- |
| `Aduan_Kerja` | `id`, `tarikh`, `tajuk`, `lokasi`, `kategori`, `keutamaan`, `status`, `staf_id`, `catatan`, `dikemas_kini`, `versi` | ADU-001 · 2026-11-12 · Pam air tidak berfungsi · Blok Temenggung · Mekanikal · Mendesak · Baru · [kosong] · [kosong] · [kosong] · 0 |
| `Senarai_Harta` | `id`, `nama`, `kategori`, `lokasi`, `status` | AST-001 · Pam Air Domestik · Mekanikal · Blok Temenggung · Aktif |
| `Senarai_Staf` | `id`, `nama`, `jawatan`, `telefon`, `peranan`, `aktif` | STF01 · Amir Hakim · Juruteknik · [nombor sebenar] · Staf · YA |

- Tambah satu baris pentadbir, contohnya ID `ADM01`, peranan `Admin`, aktif `YA`. Gunakan huruf besar, angka, sempang atau garis bawah untuk ID staf.
- Dalam **Project Settings → Script Properties**, tambah satu sifat bagi setiap akaun, contohnya `PIN_ADM01` dan `PIN_STF01`. Gunakan PIN rawak dan unik 8–12 digit. Berikan PIN secara peribadi kepada pemilik akaun. Hadkan akses edit Apps Script kepada pentadbir yang dipercayai kerana editor boleh membaca Script Properties. Menukar atau membuang PIN akan membatalkan sesi lama akaun tersebut.
- Isikan nombor WhatsApp sebagai teks biasa, contohnya format `601XXXXXXXX`. Butang WhatsApp membuka draf perbualan selepas agihan disimpan. Admin menyemak draf dan menekan **Hantar** di WhatsApp.
- Masukkan aduan baharu terus dalam Sheets dengan status `Baru` dan versi `0`. Gunakan tarikh berformat paparan `yyyy-mm-dd` untuk susunan keutamaan yang betul. Nilai keutamaan ialah `Mendesak`, `Tinggi`, `Biasa`, `Rendah`. Gunakan `Aktif` bagi aset yang hendak dikira dalam kad aset aktif.
- Status kerja bergerak daripada `Baru` kepada `Diagih`, kemudian `Terima Tugas`, `Sedang Dibaiki` dan `Selesai`. Agihan semula tersedia sebelum tugasan diterima. Catatan menyimpan nilai terkini. Angka kemajuan mengira aduan selesai berbanding semua aduan yang pengguna boleh lihat, mengikut kategori dan keseluruhan.
- Gunakan aplikasi untuk perubahan status, staf dan catatan harian. Jika pentadbir membetulkan rekod secara manual, buat di luar waktu suntingan serentak dan naikkan `versi`. Kunci Apps Script mengawal penulisan daripada API sahaja.

## 2. Terbitkan Apps Script

1. Pilih **Deploy → New deployment → Web app**.
2. Tetapkan **Execute as: Me** dan **Who has access: Anyone**. Akaun Google Workspace yang menyekat pilihan ini memerlukan konfigurasi organisasi yang membenarkan kaedah ini.
3. Klik **Deploy** dan salin URL berakhir `/exec`. Buka URL dalam pelayar untuk semakan kesihatan. Respons sepatutnya memaparkan `ok: true`.
4. Dalam `app.js`, isi `API_URL` dengan URL tersebut. Simpan Google Sheets sebagai fail terhad. Endpoint memerlukan log masuk PIN untuk mengembalikan rekod operasi. Admin boleh melihat semua aduan dan nombor telefon. Staf melihat tugasan milik sendiri dan direktori tanpa nombor telefon.
5. Selepas mengubah `Code.gs`, pergi ke **Deploy → Manage deployments → Edit → New version → Deploy**. Gunakan semula URL deployment yang sama.

| Operasi | Permintaan |
| --- | --- |
| Semakan kesihatan | `GET /exec` |
| Baca untuk integrasi yang memerlukan GET | `GET /exec?action=read&token=...` |
| Log masuk | `POST` dengan `action: "login"`, `id`, `pin` |
| Muat data | `POST` dengan `action: "read"`, `token` |
| Agih | `POST` dengan `action: "assign"`, `token`, `id`, `staffId`, `note`, `version` |
| Kemas kini status | `POST` dengan `action: "advance"`, `token`, `id`, `note`, `version` |

Dashboard menggunakan badan JSON dengan `Content-Type: text/plain;charset=UTF-8` supaya POST layak sebagai permintaan CORS ringkas tanpa preflight. Pelayar mengikuti pengalihan Apps Script Content Service dan membaca respons JSON. Dashboard menghantar token di dalam badan POST bagi mengelakkan token muncul pada URL. GET berautentikasi disediakan bagi klien integrasi, tetapi token dalam URL boleh direkodkan oleh alat pemantauan atau sejarah pelayar. Gunakan POST untuk klien yang boleh menyokongnya. Sesi tamat selepas lapan jam.

## 3. Terbitkan GitHub Pages

1. Muat naik `index.html`, `style.css` dan `app.js` ke akar repositori GitHub. Simpan `Code.gs` dalam Apps Script. Jangan masukkan PIN, rahsia sesi atau data Sheets ke dalam repositori.
2. Dalam repositori, pilih **Settings → Pages → Build and deployment → Deploy from a branch → main → / (root) → Save**. Gunakan repositori awam untuk GitHub Pages percuma.
3. Selepas URL Pages tersedia, log masuk sebagai Admin dan agihkan satu aduan ujian. Semak rekod di Sheets dan buka draf WhatsApp. Kemudian log masuk sebagai staf berkenaan, kemas kini status dan sahkan perubahan di Sheets. Muat semula kedua-dua paparan untuk mengesahkan penyegerakan.
4. Jika log masuk gagal, buka URL `/exec` dalam tetingkap peribadi. Jika Google meminta log masuk, semak tetapan `Anyone`. Jika semakan kesihatan berjaya tetapi permintaan dari Pages gagal, semak panel Network untuk pengalihan atau ralat CORS dan **Apps Script → Executions** untuk ralat pelayan. Uji sambungan menggunakan URL GitHub Pages sebenar sebelum memasukkan data operasi.

Tailwind Play CDN digunakan mengikut spesifikasi tanpa proses binaan. CSS utama dashboard turut disertakan dalam `style.css`. Mod demo dan logik API boleh diuji secara setempat. Pengesahan integrasi sebenar memerlukan URL Web App daripada Google Sheets anda.
