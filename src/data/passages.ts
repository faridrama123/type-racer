import { CarColor, CarModelId, Passage } from '../types/game';

export const CAR_MODELS: { id: CarModelId; label: string }[] = [
  { id: 'formula', label: 'Formula GP' },
  { id: 'gt', label: 'GT Coupe' },
  { id: 'rally', label: 'Rally Turbo' },
  { id: 'muscle', label: 'Muscle V8' },
  { id: 'ev', label: 'Hyper EV' },
  { id: 'classic', label: 'Classic Touring' },
];

export const CAR_COLORS: CarColor[] = [
  { id: 'vermilion', name: 'Merah Balap', hex: '#EA580C', accent: '#FED7AA' },
  { id: 'cobalt', name: 'Biru Sirkuit', hex: '#2563EB', accent: '#BFDBFE' },
  { id: 'emerald', name: 'Hijau Britania', hex: '#059669', accent: '#A7F3D0' },
  { id: 'amber', name: 'Kuning Podium', hex: '#D97706', accent: '#FDE68A' },
  { id: 'crimson', name: 'Merah Maranello', hex: '#DC2626', accent: '#FECACA' },
  { id: 'slate', name: 'Abu Titanium', hex: '#334155', accent: '#CBD5E1' },
];

export const PASSAGES: Passage[] = [
  {
    id: 'id-nusantara-1',
    title: 'Menembus Batas Kecepatan',
    author: 'Redaksi TypeRally',
    category: 'Balap & Fokus',
    language: 'id',
    difficulty: 'Normal',
    text: 'Kecepatan mengetik bukan hanya soal seberapa keras jari menekan tombol, tetapi tentang irama yang tenang dan mata yang membaca dua kata ke depan. Ketika pikiran dan jari bergerak selaras, setiap kalimat mengalir tanpa hambatan menuju garis finis.',
  },
  {
    id: 'id-sastra-1',
    title: 'Jejak Langkah di Pelabuhan',
    author: 'Pramoedya Ananta Toer (Adaptasi)',
    category: 'Sastra Indonesia',
    language: 'id',
    difficulty: 'Menengah',
    text: 'Orang boleh pandai setinggi langit, tetapi selama ia tidak menulis, ia akan hilang di dalam masyarakat dan dari sejarah. Menulis adalah bekerja untuk keabadian, merangkai gagasan agar tetap hidup melampaui zaman.',
  },
  {
    id: 'id-kopi-1',
    title: 'Ritual Pagi dan Secangkir Kopi',
    author: 'Catatan Nusantara',
    category: 'Budaya & Gaya Hidup',
    language: 'id',
    difficulty: 'Normal',
    text: 'Di sudut kota yang baru terjaga, aroma biji kopi sangrai menyapa udara pagi yang sejuk. Suara ketukan papan ketik terdengar teratur, menemani para perancang dan penulis muda menyiapkan karya terbaik mereka sebelum matahari meninggi.',
  },
  {
    id: 'id-teknologi-1',
    title: 'Jaringan Lokal Tanpa Jeda',
    author: 'Ensiklopedia Jaringan',
    category: 'Teknologi',
    language: 'id',
    difficulty: 'Menengah',
    text: 'Dalam satu jaringan Wi-Fi yang sama, paket data melesat hanya dalam hitungan milidetik dari satu perangkat ke perangkat lainnya. Koneksi langsung ini memungkinkan pemain berkompetisi secara sinkron tanpa latensi yang mengganggu ketepatan waktu.',
  },
  {
    id: 'id-alam-1',
    title: 'Puncak Rinjani Saat Fajar',
    author: 'Jurnal Pendaki',
    category: 'Alam Indonesia',
    language: 'id',
    difficulty: 'Tantangan',
    text: 'Angin dingin berhembus kencang di punggungan gunung berapi ketika semburat jingga mulai membelah cakrawala timur. Di bawah sana, danau kawah berkilau tenang memantulkan cahaya pertama yang menyentuh gugusan awan putih.',
  },
  {
    id: 'id-inovasi-1',
    title: 'Seni Ketelitian Mekanis',
    author: 'Majalah Desain Industri',
    category: 'Desain & Karya',
    language: 'id',
    difficulty: 'Tantangan',
    text: 'Setiap tombol mekanis dirancang dengan gaya pegas yang terukur agar pantulan jari terasa mantap dan konsisten. Dengan latihan rutin lima belas menit sehari, akurasi sembilan puluh delapan persen bukanlah hal yang mustahil untuk dicapai.',
  },
  {
    id: 'en-typeracer-1',
    title: 'The Rhythm of Ten Fingers',
    author: 'TypeRally Editorial',
    category: 'Speed Classics',
    language: 'en',
    difficulty: 'Normal',
    text: 'True typing speed comes from accuracy first and velocity second. When you trust your muscle memory instead of looking down at the keys, errors vanish and your words per minute climb steadily lap after lap.',
  },
  {
    id: 'en-space-1',
    title: 'Pale Blue Dot',
    author: 'Carl Sagan',
    category: 'Science & Space',
    language: 'en',
    difficulty: 'Menengah',
    text: 'Look again at that dot. That is here. That is home. That is us. On a mote of dust suspended in a sunbeam, every human story and every quiet triumph has unfolded beneath the vast cosmic dark.',
  },
  {
    id: 'en-code-1',
    title: 'Clean Protocols & Real-Time State',
    author: 'Systems Handbook',
    category: 'Engineering',
    language: 'en',
    difficulty: 'Tantangan',
    text: 'WebSocket frames carry lightweight JSON payloads across the local router, keeping every client synchronized to a single authoritative clock. Deterministic state machines ensure smooth animations without dropped updates.',
  },
  {
    id: 'en-racing-1',
    title: 'Apex at Suzuka',
    author: 'Motorsport Digest',
    category: 'Racing',
    language: 'en',
    difficulty: 'Menengah',
    text: 'Braking late into the hairpin requires complete focus and steady hands on the wheel. Exit traction decides the drag race down the back straight as twin engines roar toward the checkered flag.',
  },
];

export function getRandomPassage(language?: 'id' | 'en', excludeId?: string): Passage {
  const pool = PASSAGES.filter(
    (p) => (!language || p.language === language) && p.id !== excludeId
  );
  const source = pool.length > 0 ? pool : PASSAGES;
  return source[Math.floor(Math.random() * source.length)];
}
