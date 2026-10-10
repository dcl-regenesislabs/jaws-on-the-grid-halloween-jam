// Made-up identities for bots: a wallet-shaped address, a player-style name
// and a random base-avatars outfit. Wearable names come from the official
// catalog (peer.decentraland.org/lambdas/collections/wearables?collectionId=
// urn:decentraland:off-chain:base-avatars, fetched 2026-10-10); every one
// listed here has both body shapes.

const BASE = 'urn:decentraland:off-chain:base-avatars:'

const HAIR = ['casual_hair_01', 'casual_hair_02', 'casual_hair_03', 'cool_hair', 'cornrows', 'curly_hair', 'curtained_hair', 'double_bun', 'hair_anime_01', 'hair_bun', 'hair_coolshortstyle', 'hair_f_oldie', 'hair_f_oldie_02', 'hair_oldie', 'hair_punk', 'hair_stylish_hair', 'hair_undere', 'keanu_hair', 'modern_hair', 'moptop', 'pompous', 'pony_tail', 'punk', 'rasta', 'semi_afro', 'semi_bold', 'short_hair', 'shoulder_bob_hair', 'shoulder_hair', 'slicked_hair', 'standard_hair', 'tall_front_01', 'two_tails']
const EYEBROWS = ['eyebrows_00', 'eyebrows_01', 'eyebrows_02', 'eyebrows_03', 'eyebrows_04', 'eyebrows_05', 'eyebrows_06', 'eyebrows_07', 'eyebrows_09', 'eyebrows_10', 'eyebrows_11', 'eyebrows_12', 'eyebrows_13', 'eyebrows_14', 'eyebrows_15', 'eyebrows_16', 'eyebrows_17', 'eyebrows_8', 'f_eyebrows_00', 'f_eyebrows_01', 'f_eyebrows_02', 'f_eyebrows_03', 'f_eyebrows_04', 'f_eyebrows_05', 'f_eyebrows_06', 'f_eyebrows_07']
const EYES = ['eyes_00', 'eyes_01', 'eyes_02', 'eyes_03', 'eyes_04', 'eyes_05', 'eyes_06', 'eyes_07', 'eyes_08', 'eyes_09', 'eyes_10', 'eyes_11', 'eyes_12', 'eyes_13', 'eyes_14', 'eyes_15', 'eyes_16', 'eyes_17', 'eyes_18', 'eyes_19', 'eyes_20', 'eyes_21', 'eyes_22', 'f_eyes_00', 'f_eyes_01', 'f_eyes_02', 'f_eyes_03', 'f_eyes_04', 'f_eyes_05', 'f_eyes_06', 'f_eyes_07', 'f_eyes_08', 'f_eyes_09', 'f_eyes_10', 'f_eyes_11']
const MOUTH = ['f_mouth_00', 'f_mouth_01', 'f_mouth_02', 'f_mouth_03', 'f_mouth_04', 'f_mouth_05', 'f_mouth_06', 'f_mouth_07', 'f_mouth_08', 'mouth_00', 'mouth_01', 'mouth_02', 'mouth_03', 'mouth_04', 'mouth_05', 'mouth_06', 'mouth_07', 'mouth_09', 'mouth_10', 'mouth_11']
const UPPER = ['Red_topcoat', 'baggy_pullover', 'bee_t_shirt', 'black_jacket', 'black_top', 'blue_tshirt', 'brown_sleveless_dress', 'colored_sweater', 'croupier_shirt', 'denimdungareesblue', 'denimdungareesred', 'elegant_striped_shirt', 'elegant_sweater', 'f_blue_elegant_shirt', 'f_blue_jacket', 'f_body_swimsuit', 'f_pink_simple_tshirt', 'f_pride_t_shirt', 'f_red_elegant_jacket', 'f_red_simple_tshirt', 'f_simple_yellow_tshirt', 'f_sport_purple_tshirt', 'f_sweater', 'f_white_shirt', 'green_hoodie', 'green_square_shirt', 'green_tshirt', 'light_green_shirt', 'lovely_yellow_shirt', 'm_sweater', 'm_sweater_02', 'poloblacktshirt', 'polobluetshirt', 'polocoloredtshirt', 'pride_tshirt', 'puffer_jacket', 'puffer_jacket_hoodie', 'red_square_shirt', 'red_tshirt', 'roller_outfit', 'safari_shirt', 'school_shirt', 'simple_blue_tshirt', 'simple_green_tshirt', 'skatercoloredlongsleeve', 'skaterquadlongsleeve', 'skatertriangleslongsleeve', 'sleeveless_punk_shirt', 'soccer_shirt', 'sport_jacket', 'striped_pijama', 'striped_shirt_01', 'striped_top', 'turtle_neck_sweater', 'white_top', 'yellow_tshirt']
const LOWER = ['basketball_shorts', 'brown_pants', 'brown_pants_02', 'cargo_shorts', 'comfortablepants', 'corduroygreenpants', 'corduroypurplepants', 'corduroysandypants', 'distressed_black_Jeans', 'elegant_blue_trousers', 'f_african_leggins', 'f_brown_skirt', 'f_brown_trousers', 'f_capris', 'f_country_pants', 'f_diamond_leggings', 'f_jeans', 'f_red_comfy_pants', 'f_red_modern_pants', 'f_roller_leggings', 'f_school_skirt', 'f_short_blue_jeans', 'f_short_colored_leggins', 'f_sport_shorts', 'f_stripe_long_skirt', 'f_stripe_white_pants', 'f_yoga_trousers', 'grey_joggers', 'hip_hop_joggers', 'jean_shorts', 'kilt', 'oxford_pants', 'pijama_pants', 'safari_pants', 'soccer_pants', 'striped_swim_suit', 'swim_short', 'trash_jean']
const FEET = ['Espadrilles', 'bear_slippers', 'bun_shoes', 'citycomfortableshoes', 'classic_shoes', 'comfy_green_sandals', 'comfy_sport_sandals', 'crocs', 'crocsocks', 'f_m_sandals', 'm_feet_soccershoes', 'm_greenflipflops', 'moccasin', 'pink_blue_socks', 'pink_sleepers', 'red_sandals', 'ruby_blue_loafer', 'ruby_red_loafer', 'sneakers', 'sport_black_shoes', 'sport_blue_shoes', 'sport_colored_shoes']
const FACIAL_HAIR = ['Mustache_Short_Beard', 'balbo_beard', 'beard', 'chin_beard', 'french_beard', 'full_beard', 'goatee_beard', 'granpa_beard', 'handlebar', 'horseshoe_beard', 'lincoln_beard', 'old_mustache_beard', 'short_boxed_beard']
const EYEWEAR = ['aviatorstyle', 'black_sun_glasses', 'cyclope', 'f_glasses', 'f_glasses_cat_style', 'f_glasses_city', 'f_glasses_fashion', 'heart_glasses', 'italian_director', 'matrix_sunglasses', 'piratepatch', 'retro_sunglasses', 'rounded_sun_glasses', 'thug_life']
const EARRING = ['Thunder_earring', 'blue_star_earring', 'f_skull_earring', 'golden_earring', 'green_feather_earring', 'pearls_earring', 'pink_gem_earring', 'punk_piercing', 'square_earring', 'thunder_02_earring', 'toruspiercing', 'triple_ring']
const HEAD = ['blue_bandana', 'diamond_colored_tiara', 'green_stone_tiara', 'laurel_wreath', 'red_bandana']
const HANDS = ['black_glove', 'cord_bracelet', 'dcl_watch', 'emerald_ring']

// Optional slots: chance the bot wears one (rest always worn).
const OPTIONAL: [string[], number][] = [[EYEWEAR, 0.25], [EARRING, 0.2], [HEAD, 0.1], [HANDS, 0.15]]

type Color = { r: number; g: number; b: number }
const SKIN: Color[] = [
  { r: 1, g: 0.894, b: 0.776 }, { r: 1, g: 0.867, b: 0.737 }, { r: 0.949, g: 0.761, b: 0.647 },
  { r: 0.8, g: 0.608, b: 0.467 }, { r: 0.6, g: 0.462, b: 0.356 }, { r: 0.427, g: 0.329, b: 0.267 },
  { r: 0.341, g: 0.255, b: 0.196 }, { r: 0.278, g: 0.196, b: 0.157 }
]
const HAIR_COLOR: Color[] = [
  { r: 0.109, g: 0.109, b: 0.109 }, { r: 0.283, g: 0.142, b: 0 }, { r: 0.4, g: 0.2, b: 0.1 },
  { r: 0.596, g: 0.373, b: 0.216 }, { r: 0.89, g: 0.75, b: 0.47 }, { r: 0.68, g: 0.18, b: 0.12 },
  { r: 0.8, g: 0.8, b: 0.8 }, { r: 0.94, g: 0.35, b: 0.62 }, { r: 0.2, g: 0.45, b: 0.9 }
]
const EYE_COLOR: Color[] = [
  { r: 0.373, g: 0.223, b: 0.196 }, { r: 0.283, g: 0.142, b: 0 }, { r: 0.18, g: 0.35, b: 0.6 },
  { r: 0.23, g: 0.5, b: 0.3 }, { r: 0.5, g: 0.5, b: 0.5 }, { r: 0.1, g: 0.1, b: 0.1 }
]

// Player-style names, the kind that show up in a World on a jam night.
const NAMES = [
  'Nacho', 'lunaverse', 'MetaMike', 'cryptoSofi', 'Tano', 'pixelpaz', 'Rocio', 'jbarba', 'Gonza', 'Mel0n',
  'tincho_dcl', 'Valen', 'skullkid', 'Agus', 'frankie', 'ninaa', 'Juanpi', 'Bauti', 'koala', 'Delfi',
  'Cami', 'Lolo', 'santi.eth', 'Mora', 'elpibe', 'Fede', 'mariposa', 'Toto', 'Wen',
  'Vicky', 'Ramiro', 'lucho', 'Pau', 'Brenda', 'yoyo', 'Kiki', 'zeta', 'chiqui',
  'Turtle', 'Dani', 'Marce', 'Lu', 'Emi', 'polilla', 'Ana', 'Tomi', 'gaby_g', 'Mati', 'Juli', 'Coco',
  'Jaz', 'Rulo', 'Leo', 'boop', 'Pipa', 'Facu', 'Sol', 'nico.dcl', 'Mili', 'Pancho'
]

function pick<T>(xs: readonly T[]): T {
  return xs[Math.floor(Math.random() * xs.length)]
}

export function randomAddress(): string {
  let hex = ''
  for (let n = 0; n < 40; n++) hex += Math.floor(Math.random() * 16).toString(16)
  return '0x' + hex
}

// A name no current player is using.
export function randomName(taken: Set<string>): string {
  const free = NAMES.filter((n) => !taken.has(n.toLowerCase()))
  return free.length ? pick(free) : `${pick(NAMES)}${Math.floor(Math.random() * 90) + 10}`
}

export function randomLook(): { bodyShape: string; wearables: string[]; skinColor: Color; hairColor: Color; eyesColor: Color } {
  const male = Math.random() < 0.5
  const wearables = [pick(HAIR), pick(EYEBROWS), pick(EYES), pick(MOUTH), pick(UPPER), pick(LOWER), pick(FEET)]
  if (male && Math.random() < 0.35) wearables.push(pick(FACIAL_HAIR))
  for (const [list, chance] of OPTIONAL) if (Math.random() < chance) wearables.push(pick(list))
  return {
    bodyShape: BASE + (male ? 'BaseMale' : 'BaseFemale'),
    wearables: wearables.map((w) => BASE + w),
    skinColor: { ...pick(SKIN) },
    hairColor: { ...pick(HAIR_COLOR) },
    eyesColor: { ...pick(EYE_COLOR) }
  }
}
