# LPG Automation

Otomasi berbasis Node.js + Puppeteer untuk membantu verifikasi NIK dan transaksi LPG 3 kg secara otomatis. Repositori ini dirancang agar terstruktur, mudah dikonfigurasi, dan siap dipakai ulang.

## ? Fitur Utama
- **Automasi berbasis Puppeteer** yang mengikuti alur resmi portal Subsidi Tepat LPG.
- **Persistensi data**: menyimpan riwayat NIK yang sudah diproses dan yang ditolak (invalid).
- **Konfigurasi fleksibel** lewat variabel lingkungan (.env) tanpa perlu mengubah kode.
- **Struktur modular** yang mudah dipahami dan dikembangkan kembali oleh pengguna baru maupun berpengalaman.

## ??? Struktur Proyek
```text
Lpg/
  src/
    config.js        # Pemuatan konfigurasi environment & path data
    dataStore.js     # Baca/tulis JSON dan pencatatan error
    session.js       # Launch Puppeteer, login, dan navigasi halaman utama
    nikProcessor.js  # Loop pemrosesan NIK beserta penanganan kondisi khusus
    utils.js         # Helper (timestamp lokal, title case, delay)
    index.js         # Titik masuk aplikasi (run)
  data/
    README.md        # Penanda folder runtime (file JSON/log akan muncul di sini)
  pseudo.php         # Pseudo-code alur eksekusi yang bisa dibaca cepat
  .env.example       # Contoh konfigurasi environment
  package.json       # Dependensi dan npm scripts
  package-lock.json  # Lockfile tree dependensi
  README.md          # Dokumen ini
```

## ?? Mulai Cepat
1. **Siapkan lingkungan Node.js** versi 18 atau terbaru.
2. **Pasang dependensi**:
   ```bash
   npm install
   ```
3. **Konfigurasi kredensial & path**:
   - Duplikasi `.env.example` menjadi `.env`.
   - Isi `LPG_EMAIL` dan `LPG_PIN` sesuai akun portal.
   - (Opsional) Sesuaikan path data bila tidak ingin menggunakan default `./data/*.json`.
4. **Jalankan automasi**:
   ```bash
   npm run start
   ```

## ?? Output & Log
- Data NIK sumber: atur sendiri di `data/nik-data.json` (format sama dengan `nik.json` lama).
- Hasil NIK sukses: otomatis tersimpan ke `data/processed-niks.json`.
- NIK yang ditolak (kuota penuh dsb.): disimpan di `data/invalid-niks.json`.
- Catatan error teknis: `data/automation-error.log`.

## ?? Tips Keamanan
- Jangan commit file `.env` atau isi folder `data/` karena bisa memuat kredensial maupun data pelanggan.
- `.gitignore` sudah diatur untuk mengabaikan file-file tersebut.

## ??? Pengembangan & Kontribusi
- Baca `pseudo.php` untuk memahami urutan langkah secara cepat.
- Tambahkan pengujian (unit/integration) bila melakukan perubahan signifikan.
- Update selector di `src/nikProcessor.js` apabila UI portal berubah.
- Pull request dan issue report sangat dipersilakan.

## ?? Lisensi & Kredit
Repositori ini mengikuti lisensi proyek (lihat bagian `license` di `package.json`). Silakan gunakan dan modifikasi sesuai kebutuhan operasional Anda.

---
Pertanyaan atau masukan? Jangan ragu membuka issue baru. Selamat mencoba dan semoga membantu!
