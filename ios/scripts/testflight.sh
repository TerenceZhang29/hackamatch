#!/usr/bin/env bash
# Builds the app for the App Store and, with --upload, sends it to TestFlight
# (docs/plans/ios-app.md, phase 6). Signs with the team's account in Xcode
# (Xcode → Settings → Accounts); -allowProvisioningUpdates lets Xcode make the
# distribution certificate and profile the first time.
#
#   ios/scripts/testflight.sh            archive only, to check signing
#   ios/scripts/testflight.sh --upload   archive, then upload (owner's approval each time)
#
# The build number is the time (YYYYMMDD.HHMM), so every upload is higher.
set -euo pipefail
cd "$(dirname "$0")/.."

build=$(date +%Y%m%d.%H%M)
archive="build/HackaMatch-$build.xcarchive"

xcodebuild archive -project HackaMatch.xcodeproj -scheme HackaMatch -configuration Release \
  -destination "generic/platform=iOS" -archivePath "$archive" \
  CURRENT_PROJECT_VERSION="$build" -allowProvisioningUpdates -quiet
echo "Archived build $build: $archive"

if [[ "${1:-}" == "--upload" ]]; then
  xcodebuild -exportArchive -archivePath "$archive" -exportOptionsPlist Config/ExportOptions.plist \
    -exportPath "build/export-$build" -allowProvisioningUpdates
  echo "Uploaded build $build. It shows in App Store Connect → TestFlight once Apple has processed it."
fi
