# ChocoLater Store V2

Website e-commerce minuman coklat susu dengan:

- Login role `admin` dan `customer`
- Register customer otomatis masuk ke tabel `members`
- Dashboard admin dengan statistik dari database
- Data User
- Data Barang
- Menu Produk
- Pembelian/Penjualan
- Pesan/Message dari Contact Us
- Member
- Cetak laporan semua data
- Checkout tersimpan di MySQL dan diarahkan ke WhatsApp
- Upload foto produk lewat dashboard admin

## 1. Instal dependency

```bash
npm install
```

Jika PowerShell menolak `npm install`, gunakan:

```powershell
npm.cmd install
```

## 2. Buat database

Buka phpMyAdmin atau MySQL, lalu jalankan file:

```txt
database/init.sql
```

Database yang dibuat:

```txt
chocolater_store
```

Data awal:

```txt
Admin    : admin@chocolater.test / admin123
Customer : customer@chocolater.test / customer123
```

Produk awal hanya 2:

```txt
Choco Milk Original - Rp12.000
Choco Cream Cheese  - Rp14.000
```

Tabel pembelian/penjualan belum diisi. Data akan muncul setelah customer checkout.

## 3. Setting .env

Copy `.env.example` menjadi `.env`, lalu sesuaikan:

```env
PORT=3000
DB_HOST=localhost
DB_USER=root
DB_PASSWORD=
DB_NAME=chocolater_store
WHATSAPP_NUMBER=6281234567890
PASSWORD_SECRET=chocolate-later-secret
```

Catatan: jangan ganti `PASSWORD_SECRET` sebelum login pertama, karena password default di database dibuat memakai secret tersebut.

## 4. Jalankan server

```bash
npm start
```

Buka:

```txt
http://localhost:3000
```

## 5. Halaman penting

```txt
/login.html              Login admin/customer
/register.html           Daftar customer/member
/dashboard.html          Dashboard admin
/admin-users.html        Data user
/admin-barang.html       Data barang/menu + upload foto
/admin-menu.html         Menu produk
/admin-orders.html       Pembelian/Penjualan
/admin-messages.html     Pesan/Message
/admin-members.html      Member
/admin-reports.html      Cetak laporan semua data
```

## 6. Cara kerja role

- `admin` dapat masuk ke dashboard dan semua menu admin.
- `customer` hanya bisa belanja, checkout, dan mendaftar sebagai member.
- Link Dashboard di header hanya muncul jika user yang login adalah admin.

## 7. Upload foto produk

Di halaman `admin-barang.html`, gunakan bagian `Upload Foto`. File akan masuk ke:

```txt
public/uploads
```

Path gambar otomatis disimpan ke database sebagai:

```txt
/uploads/nama-file.jpg
```

## Update Admin: Pembelian Manual dan Cetak Laporan

Perubahan terbaru:

- Menu `Pembelian/Penjualan` sekarang memiliki form **Tambah Pembelian Manual** untuk customer yang membeli langsung di toko.
- Pembelian manual tetap masuk ke tabel `orders` dan `order_items`, serta stok produk otomatis berkurang.
- Menu `Laporan` sekarang bisa difilter dan dicetak berdasarkan:
  - Harian
  - Bulanan
  - Tahunan
- Format cetak laporan sudah memakai header resmi berisi:
  - Logo toko di kiri
  - Nama toko ChocoLater Store
  - Institut Bisnis Pelita Indonesia
  - Nomor telepon
  - Email
  - Garis pemisah sebelum isi laporan
- Bagian akhir laporan menampilkan nama admin yang mencetak berdasarkan session login.

Catatan: perubahan ini memakai tabel database yang sudah ada, yaitu `orders`, `order_items`, dan `products`, jadi tidak perlu membuat tabel baru.
