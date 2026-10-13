import { api } from '../services/api';
import type { InterestProfile, NewsItem } from '../types';

export async function fetchProfile() {
  return api.getProfile();
}

export async function updateProfile(profile: Partial<InterestProfile>) {
  return api.updateProfile(profile);
}

export async function scoreItems(items: NewsItem[], profile?: InterestProfile) {
  return api.scoreItems(items, profile);
}

export async function scoreNewItems() {
  return api.scoreNewItems();
}
