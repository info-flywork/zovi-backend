'use strict';

/** Shared prompt pool for seed script + lazy catalog expand. */
const MUSIC_PROMPTS = [
  {
    prompt:
      'Upbeat house track with catchy vocal hooks, club energy, modern production',
    instrumental: false,
  },
  {
    prompt:
      'Dreamy indie pop song with soft female vocals, warm guitars, sunset vibes',
    instrumental: false,
  },
  {
    prompt: 'Chill lo-fi beat with mellow piano and vinyl crackle, study mood',
    instrumental: true,
  },
  {
    prompt:
      'Energetic dance-pop with bright synths and confident male vocals',
    instrumental: false,
  },
  {
    prompt: 'Smooth R&B groove with silky vocals, late-night city lights feel',
    instrumental: false,
  },
  {
    prompt: 'Synthwave instrumental with retro 80s drums and neon bassline',
    instrumental: true,
  },
  {
    prompt: 'Acoustic folk ballad with intimate vocals and fingerpicked guitar',
    instrumental: false,
  },
  {
    prompt:
      'Dark electronic bass track with pulsing low end, underground club vibe',
    instrumental: true,
  },
  {
    prompt: 'Feel-good summer pop with tropical percussion and catchy chorus',
    instrumental: false,
  },
  {
    prompt: 'Ambient cinematic instrumental with soft pads and gentle piano',
    instrumental: true,
  },
  {
    prompt: 'Hip-hop beat with melodic hook and confident flow energy',
    instrumental: false,
  },
  {
    prompt: 'Jazz-infused chill hop with brushed drums and warm keys',
    instrumental: true,
  },
  {
    prompt: 'Emotional indie rock with driving guitars and anthemic chorus',
    instrumental: false,
  },
  {
    prompt: 'Deep house instrumental with groovy bass and atmospheric pads',
    instrumental: true,
  },
  {
    prompt: 'Romantic pop ballad with soft piano and heartfelt vocals',
    instrumental: false,
  },
  {
    prompt: 'Funky disco-pop with groovy bassline and joyful vocals',
    instrumental: false,
  },
  {
    prompt: 'Trap beat with dark melodies and hard-hitting 808s',
    instrumental: true,
  },
  {
    prompt: 'Soft bedroom pop with airy vocals and dreamy synths',
    instrumental: false,
  },
  {
    prompt: 'Techno banger with driving kick and hypnotic arps',
    instrumental: true,
  },
  {
    prompt: 'Country-pop crossover with warm vocals and acoustic guitar',
    instrumental: false,
  },
  {
    prompt: 'Latin pop with sunny percussion and catchy Spanish-style chorus energy',
    instrumental: false,
  },
  {
    prompt: 'Afrobeats groove with warm vocals, syncopated drums and bright synths',
    instrumental: false,
  },
  {
    prompt: 'K-pop inspired upbeat track with polished vocals and punchy drums',
    instrumental: false,
  },
  {
    prompt: 'Gospel-tinged soul song with powerful vocals and rich organ chords',
    instrumental: false,
  },
  {
    prompt: 'Metalcore instrumental with heavy guitars and aggressive drums',
    instrumental: true,
  },
  {
    prompt: 'Reggae chill track with laid-back vocals and offbeat guitar skank',
    instrumental: false,
  },
  {
    prompt: 'Phonk track with cowbells, distorted bass and night-drive vibe',
    instrumental: true,
  },
  {
    prompt: 'Orchestral trailer music with big drums and rising strings',
    instrumental: true,
  },
  {
    prompt: 'UK garage vocal track with skippy drums and soulful topline',
    instrumental: false,
  },
  {
    prompt: 'Bossa nova lounge with soft female vocals and nylon guitar',
    instrumental: false,
  },
  {
    prompt: 'Drum and bass roller with energetic breaks and atmospheric pads',
    instrumental: true,
  },
  {
    prompt: 'Sad piano pop song with vulnerable vocals and intimate production',
    instrumental: false,
  },
  {
    prompt: 'Hyperpop track with glitchy vocals, bright synths and chaotic energy',
    instrumental: false,
  },
  {
    prompt: 'Blues rock jam with gritty vocals and expressive guitar solos',
    instrumental: false,
  },
  {
    prompt: 'Meditation drone ambient with soft textures and no percussion',
    instrumental: true,
  },
  {
    prompt: 'Salsa instrumental with lively brass and infectious piano montuno',
    instrumental: true,
  },
  {
    prompt: 'Emo indie song with yearning vocals and distorted guitars',
    instrumental: false,
  },
  {
    prompt: 'Future bass drop-heavy instrumental with colorful synth leads',
    instrumental: true,
  },
  {
    prompt: 'Classic Motown-inspired soul with tight harmonies and brass stabs',
    instrumental: false,
  },
  {
    prompt: 'Cinematic lo-fi hip hop with dusty drums and nostalgic keys',
    instrumental: true,
  },
  {
    prompt: 'Punk rock anthem with shouty vocals and fast power chords',
    instrumental: false,
  },
  {
    prompt: 'Arabic-inspired pop fusion with oud textures and modern beat',
    instrumental: false,
  },
  {
    prompt: 'Tropical house with soft vocals, piano chords and deep kick',
    instrumental: false,
  },
  {
    prompt: 'Shoegaze wall of sound with dreamy vocals and washed-out guitars',
    instrumental: false,
  },
  {
    prompt: 'Minimal techno with hypnotic groove and subtle melodic motifs',
    instrumental: true,
  },
  {
    prompt: 'Broadway-style musical theatre ballad with dramatic vocals',
    instrumental: false,
  },
  {
    prompt: 'Indie folk with male-female duet and gentle acoustic strumming',
    instrumental: false,
  },
  {
    prompt: 'Hardstyle festival banger with reverse bass and euphoric lead',
    instrumental: true,
  },
  {
    prompt: 'Neo-soul track with silky falsetto and warm Rhodes chords',
    instrumental: false,
  },
  {
    prompt: 'Cyberpunk industrial electronic with dark vocals and metallic hits',
    instrumental: false,
  },
];

module.exports = { MUSIC_PROMPTS };
