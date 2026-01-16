/**
 * A single game profile
 */
export interface Profile {
  uuid: string;
  username: string;
}

/**
 * Response from the profiles API
 */
export interface ProfilesResponse {
  owner: string;
  profiles: Profile[];
}

/**
 * Stored selected profile
 */
export interface SelectedProfile {
  uuid: string;
  username: string;
  selectedAt: number;
}
