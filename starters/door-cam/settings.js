// Make it yours: how the camera behaves. Run `dukoi deploy` after a change.

export const settings = {
  // Photos a second sent from the camera page. More when someone watches /live.
  idleFps: 1,
  liveFps: 8,

  // Photo size and JPEG quality (0 to 1). Smaller is cooler and lighter on Wi-Fi.
  width: 640,
  quality: 0.7,

  // Motion: the share of the picture that has to change (0.03 is 3%).
  // Raise it if leaves or shadows set it off; lower it to catch smaller things.
  motionArea: 0.03,
  // Wait this many seconds after an alert before sending another.
  motionCooldown: 60,

  // Save a photo for the timelapse this often, in seconds. Kept for 7 days.
  timelapseEvery: 60,
}
