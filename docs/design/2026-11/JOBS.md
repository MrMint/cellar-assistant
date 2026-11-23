# Jobs: everything the app does today, on main and on the branch

The guard against a redesign that silently drops a job. A job is one thing a person can do or find
out on a surface. Every board in this pass names the job ids it carries, and the phase 7 parity
audit checks every id below against the boards.

- **Read from source on 2026-11-23, not from a running app.** `reach` (taps from the nearest nav
  entry) is an estimate from the code.
- **Main** (`d3a5b1e9`, the old production UI): 321 jobs on 97 surfaces, ids `M-001`–`M-321`.
- **Branch** (`987681bc`, the redesign): 643 jobs, ids `B-001`–`B-643`.
- The branch's first four areas were listed by a surveyor that ran out of turns before writing
  notes, so its notes cover the last two areas only.
- Which main jobs have no counterpart on the branch is in `PARITY-MAIN-BRANCH.md` (when written).

| Area | Main | Branch |
|---|---|---|
| Shell and Home | 33 | 75 |
| Cellars and items | 64 | 117 |
| Capture and onboarding | 31 | 58 |
| Places, map and menus | 84 | 80 |
| Social, recap, taste and tier lists | 64 | 147 |
| Recipes and search | 45 | 166 |

---

# Main (`d3a5b1e9`)

### Shell and Home

| id | route or surface | job | device | reach | source |
|---|---|---|---|---|---|
| M-001 | `/` | land on search when signed in, or on sign-in when not | both | deep link only | app/page.tsx:9 |
| M-002 | `/sign-in` | sign in with Google, Discord or Facebook | both | deep link only | components/auth/SocialButtons.tsx:27 |
| M-003 | `/sign-in` | open the folded email-and-password form | both | deep link only | components/auth/SignInApiClient.tsx:183 |
| M-004 | `/sign-in` | sign in with email and password | both | deep link only | components/auth/SignInApiClient.tsx:112 |
| M-005 | `/sign-in` | go to sign-up from sign-in | both | 1 | components/auth/SignInApiClient.tsx:158 |
| M-006 | `/sign-in` | be sent past sign-in when already signed in (returnTo or cellars) | both | deep link only | app/sign-in/page.tsx:24 |
| M-007 | `/sign-up` | sign up with Google, Discord or Facebook | both | 1 (from sign-in) | components/auth/SignUpApiClient.tsx:63 |
| M-008 | `/sign-up` | create an account with display name, email, password | both | 1 (from sign-in) | components/auth/SignUpApiClient.tsx:202 |
| M-009 | `/sign-up` | go back to sign-in from sign-up | both | 1 | components/auth/SignUpApiClient.tsx:97 |
| M-010 | side rail / bottom bar | jump to Cellars, Search, Map, Tier Lists from the nav | both | 1 | components/common/SideNavigationBar.tsx:116 |
| M-011 | side rail | jump to Rankings, Favorites, Recipes, Brands, Friends from the rail | desktop | 1 | components/common/SideNavigationBar.tsx:116 |
| M-012 | bottom bar › "…" overflow menu | reach Rankings, Favorites, Recipes, Brands, Friends on a phone | phone | 2 | components/common/SideNavigationBar.tsx:244 |
| M-013 | nav › avatar menu | open Edit Profile | both | 2 | components/common/SideNavigationBar.tsx:106 |
| M-014 | nav › avatar menu | sign out | both | 2 | components/common/SideNavigationBar.tsx:107 |
| M-015 | nav (icon rail) | see a tooltip name for each nav icon on hover | desktop | 1 (hover) | components/common/SideNavigationBar.tsx:56 |
| M-016 | `/users/edit` | change my display name | both | 3 (avatar › Edit Profile) | components/user/EditProfileClient.tsx:50 |
| M-017 | `/users/edit` | be told my session ended and to sign in again | both | deep link only | app/(authenticated)/users/edit/page.tsx:17 |
| M-018 | header breadcrumbs (about 10 pages) | climb back up a level via a breadcrumb | both | 1 | components/common/breadcrumbs.ts:25 |
| M-019 | install dialog (first visit, every authenticated page) | install the app (Android/Chromium prompt) | phone | 1 | components/common/InstallPwaDialog.tsx:215 |
| M-020 | install dialog | read the iOS Safari "Add to Home Screen" steps | phone | 0 (auto-opens) | components/common/InstallPwaDialog.tsx:184 |
| M-021 | install dialog | postpone the install prompt for 7 days | both | 1 | components/common/InstallPwaDialog.tsx:22 |
| M-022 | install dialog | never see the install prompt again | both | 2 (tick box, close) | components/common/InstallPwaDialog.tsx:198 |
| M-023 | `/~offline` | see the offline notice and retry by reloading | both | deep link only | app/~offline/page.tsx:44 |
| M-024 | `/search` (landing) | read a time-of-day greeting | both | 1 | components/search/Greeting.tsx:7 |
| M-025 | `/search` (landing) | see my collection counts (cellars, items per type) | both | 1 | components/search/adapter.ts:52 |
| M-026 | `/search` (landing) › quick-link chips | jump to Cellars, Map, Tier Lists, Favorites or Rankings | both | 2 | app/(authenticated)/search/page.tsx:117 |
| M-027 | `/search` (landing) › Recent Activity | see recent adds, reviews and tier placements | both | 1 | components/search/RecentActivity.tsx:169 |
| M-028 | `/search` (landing) › Recent Activity | filter activity by added, reviewed or tier-listed | both | 2 | components/search/RecentActivity.tsx:61 |
| M-029 | `/search` (landing) › Recent Activity | open an item from an activity entry | both | 2 | components/search/RecentActivity.tsx:234 |
| M-030 | `/search` (landing) › Nearby Places | see places near me (needs browser location or cached geo) | both | 1 | components/search/NearbyPlaces.tsx:215 |
| M-031 | `/search` (landing) › Nearby Places | filter nearby places by item type | both | 2 | components/search/NearbyPlaces.tsx:218 |
| M-032 | `/search` (landing) › Nearby Places | open a nearby place on the map | both | 2 | components/search/NearbyPlaces.tsx:283 |
| M-033 | `/search` (landing) › Nearby Places | open the whole map from "View all on map" | both | 2 | components/search/NearbyPlaces.tsx:394 |

### Cellars and items

| id | route or surface | job | device | reach | source |
|---|---|---|---|---|---|
| M-034 | `/cellars` | see every cellar I can view (mine, co-owned, friends', public) | both | 1 | components/cellar/Cellars.tsx:96 |
| M-035 | `/cellars` › cellar card | see who co-owns a cellar from avatars | both | 1 | components/cellar/CellarCard.tsx:108 |
| M-036 | `/cellars` › cellar card | see how many bottles of each type a cellar holds | both | 1 | components/cellar/CellarCard.tsx:131 |
| M-037 | `/cellars` › cellar card | open a cellar's item list | both | 2 | components/cellar/CellarCard.tsx:84 |
| M-038 | `/cellars` › cellar card | open edit for a cellar (pencil) | both | 2 | components/cellar/CellarCard.tsx:96 |
| M-039 | `/cellars` | start a new cellar | both | 2 | components/cellar/Cellars.tsx:79 |
| M-040 | `/cellars/add` | create a cellar with a name | both | 3 | components/cellar/CellarForm.tsx:134 |
| M-041 | `/cellars/add` | choose cellar privacy (private, friends, public) | both | 3 | components/cellar/CellarForm.tsx:148 |
| M-042 | `/cellars/add` | add friends as co-owners | both | 3 | components/cellar/CellarForm.tsx:153 |
| M-043 | `/cellars/[id]/edit` | rename a cellar, change privacy or co-owners | both | 3 | components/cellar/EditCellarClient.tsx:77 |
| M-044 | `/cellars/[id]/edit` | delete a cellar (creator only, confirm dialog) | both | 3 | components/cellar-api/DeleteCellarButton.tsx:63 |
| M-045 | `/cellars/[id]/items` | browse a cellar's non-empty bottles as a grid | both | 2 | components/cellar/CellarItemsGrid.tsx:364 |
| M-046 | `/cellars/[id]/items` | search a cellar's bottles by meaning (300 ms) | both | 2 | components/cellar/CellarItemsControls.tsx:51 |
| M-047 | `/cellars/[id]/items` | filter a cellar by drink type with counts | both | 2 | components/cellar/CellarItemsFilter.tsx:46 |
| M-048 | `/cellars/[id]/items` | go to add an item to this cellar | both | 3 | components/cellar/CellarItemsControls.tsx:100 |
| M-049 | any item card (cellar, favourites, type index) | favourite or unfavourite an item from its card | both | 2 | components/item/ItemCard/index.tsx:91 |
| M-050 | any item card | see how many people favourited an item | both | 2 | components/item/ItemCard/index.tsx:218 |
| M-051 | `/cellars/[id]` | see a cellar overview with a bottle preview | both | ORPHAN | app/(authenticated)/cellars/[cellarId]/page.tsx:30 |
| M-052 | `/cellars/[id]` › bottle card | check in a bottle for just me | both | ORPHAN | components/cellar-api/CheckInButton.tsx:134 |
| M-053 | `/cellars/[id]` › bottle card | check in a bottle for me and chosen friends | both | ORPHAN | components/cellar-api/CheckInButton.tsx:151 |
| M-054 | `/cellars/[id]` › check-ins list | read the cellar's check-in history | both | ORPHAN | components/cellar-api/CellarCheckIns.tsx:88 |
| M-055 | `/cellars/[id]` › check-ins list | load more check-ins | both | ORPHAN | components/cellar-api/CellarCheckIns.tsx:167 |
| M-056 | `/cellars/[id]` header | edit cellar, view items, or add item from overview | both | ORPHAN | components/cellar/CellarOverviewHeader.tsx:54 |
| M-057 | `/cellars/[id]/{type}s/[bottleId]` | see the bottle's photo, name, description and details | both | 3 | components/item/CellarItemPageView.tsx:78 |
| M-058 | bottle page | favourite or unfavourite the item | both | 3 | components/item/ItemDetails.tsx:41 |
| M-059 | bottle page | set or replace the bottle's display photo from the camera or a file | both | 3 | components/item/AddPhoto.tsx:73 |
| M-060 | bottle page | see sake/tea characteristics, flavour profile, ingredients | both | 3 | components/item/ItemCharacteristics.tsx:10 |
| M-061 | bottle page | mark a bottle opened ("Open it!") | both | 3 | components/item/ItemRemainingSlider.tsx:116 |
| M-062 | bottle page › remaining slider | set how much is left in an opened bottle | both | 3 | components/item/ItemRemainingSlider.tsx:123 |
| M-063 | bottle page › remaining slider | mark a bottle finished (slide to 0) | both | 3 | components/item/ItemRemainingSlider.tsx:147 |
| M-064 | bottle page | see when a bottle was opened or emptied | both | 3 | components/item/ItemRemainingSlider.tsx:147 |
| M-065 | bottle page › check-ins | check in this bottle for myself (once opened) | both | 3 | components/item/ItemCheckIns.tsx:148 |
| M-066 | bottle page › check-ins | check in this bottle with friends (bulk) | both | 3 | components/item/ItemCheckIns.tsx:208 |
| M-067 | bottle page › check-ins | see who checked in this bottle and when | both | 3 | components/item/ItemCheckIns.tsx:179 |
| M-068 | bottle page › share | show a link and QR code to the item | both | 3 | components/item/ItemShare.tsx:56 |
| M-069 | bottle page | open the item's brand/winery/brewery page | both | 4 | components/item/ItemBrands.tsx:103 |
| M-070 | bottle page | see recipes that use this item (sake, tea) | both | 3 | components/item/ItemRecipes.tsx:154 |
| M-071 | bottle page | write a review with a half-star score and rich text | both | 3 | components/review/AddReview.tsx:76 |
| M-072 | bottle page | edit my review | both | 3 | components/review/AddReview.tsx:162 |
| M-073 | bottle page | delete my review | both | 3 | components/review/AddReview.tsx:206 |
| M-074 | bottle page | read others' reviews and ratings | both | 3 | components/item/ItemReviews.tsx:121 |
| M-075 | bottle page | load more reviews | both | 3 | components/item/ItemReviews.tsx:146 |
| M-076 | bottle page header | add this item to a tier list | both | 3 | components/item/CellarItemHeader.tsx:20 |
| M-077 | bottle page header | edit this bottle's item details (owner) | both | 3 | components/item/EditItemButton.tsx:4 |
| M-078 | bottle page header | delete this bottle from the cellar (owner, confirm dialog) | both | 3 | components/item/CellarItemHeader.tsx:106 |
| M-079 | `/cellars/[id]/{type}s/[bottleId]/edit` | change item name, description, country and type-specific attributes | both | 4 | components/item/ItemForm.tsx:124 |
| M-080 | `/{type}s/[itemId]` | see an item's photo, details and characteristics | both | deep link only (from search, activity, favourites, brands) | components/item/ItemPageView.tsx:65 |
| M-081 | item page | favourite or unfavourite the item | both | deep link | components/item/ItemDetails.tsx:41 |
| M-082 | item page | show a link and QR code to the item | both | deep link | components/item/ItemShare.tsx:56 |
| M-083 | item page › Located in | see which cellars hold this item, and the owners | both | deep link | components/item/ItemCellars.tsx:55 |
| M-084 | item page › Located in | open a cellar that holds this item | both | deep link | components/item/ItemCellars.tsx:45 |
| M-085 | item page › On Lists | see tier lists this item is on, and open one | both | deep link | components/item/ItemTierLists.tsx:53 |
| M-086 | item page | open the item's brand page | both | deep link | components/item/ItemBrands.tsx:159 |
| M-087 | item page | see recipes that use this item (wine, sake, tea; not spirits) | both | deep link | components/item/ItemRecipes.tsx:154 |
| M-088 | item page | add or edit or delete my review; read others'; load more | both | deep link | components/item/ItemReviews.tsx:146 |
| M-089 | item page header | add this item to a tier list | both | deep link | components/item/ItemHeaderServer.tsx:42 |
| M-090 | item page header | add this item to one of my cellars (single button or cellar picker) | both | deep link | components/item/AddToCellarActions.tsx:113 |
| M-091 | item page header | edit the catalog item | both | deep link | components/item/ItemHeaderServer.tsx:53 |
| M-092 | `/{type}s/[itemId]/edit` | change item name, description, country and attributes | both | deep link | components/item/ItemForm.tsx:124 |
| M-093 | `/{type}s` (six index pages) | see my favourites of one type | both | breadcrumb only | components/item/ItemTypeIndex.tsx:61 |
| M-094 | `/{type}s` | start adding an item of this type | both | breadcrumb only | components/item/ItemTypeIndex.tsx:44 |
| M-095 | `/{type}s` | jump to the full favourites page filtered to this type | both | breadcrumb only | components/item/ItemTypeIndex.tsx:69 |
| M-096 | `/favorites` | see all my favourited items | both | 1 | components/favorites/FavoritesClient.tsx:106 |
| M-097 | `/favorites` | filter favourites by drink type | both | 1 | components/favorites/FavoritesClient.tsx:96 |

### Capture and onboarding

| id | route or surface | job | device | reach | source |
|---|---|---|---|---|---|
| M-098 | `/cellars/[id]/items/add` | choose which drink type to add into this cellar (six cards) | both | 3 | components/cellar/AddItemClient.tsx:140 |
| M-099 | `/cellars/[id]/items/add` | be told I lack permission to add here (cards shown, not linked) | both | 3 | components/cellar/AddItemClient.tsx:121 |
| M-100 | `/add` | choose a drink type to create a catalog item outside any cellar | both | deep link (from search empty states) | app/(authenticated)/add/page.tsx:8 |
| M-101 | `/search` empty states | start "Add an item" after a failed text, barcode or photo search | both | 2 | components/search/ServerSearchResults.tsx:53 |
| M-102 | `/add/[itemType]`, `/cellars/[id]/{type}s/add` | start the add-item wizard for one type | both | 4 | components/common/OnboardingWizard/ItemOnboarding.tsx:51 |
| M-103 | wizard › barcode step | scan a barcode with the camera | phone | 4 | components/common/OnboardingWizard/BarcodeStep.tsx:22 |
| M-104 | wizard › barcode step | switch the flashlight on while scanning | phone | 4 | components/common/BarcodeScanner.tsx:184 |
| M-105 | wizard › barcode step | skip the barcode | both | 4 | components/common/OnboardingWizard/BarcodeStep.tsx:27 |
| M-106 | wizard › barcode step | read capture tips | both | 4 | components/common/OnboardingWizard/BarcodeStep.tsx:35 |
| M-107 | wizard › existing items | pick an existing catalog item that matched the barcode | both | 5 | components/common/OnboardingWizard/ExistingItems.tsx:35 |
| M-108 | wizard › existing items | say none match and create a new item | both | 5 | components/common/OnboardingWizard/ExistingItems.tsx:26 |
| M-109 | wizard › front-label step | take a photo of the front label | phone | 5 | components/common/OnboardingWizard/index.tsx:91 |
| M-110 | wizard › back-label step | take a photo of the back label | phone | 6 | components/common/OnboardingWizard/index.tsx:100 |
| M-111 | wizard › photo steps | tap to focus, toggle flashlight, take photo | phone | 5 | components/common/CameraCapture.tsx:276 |
| M-112 | wizard › photo steps | go back a step or skip a photo | both | 5 | components/common/OnboardingWizard/PictureStep.tsx:31 |
| M-113 | wizard › display-photo step | take a display photo of the bottle | phone | 7 | components/common/OnboardingWizard/DisplayPictureStep.tsx:16 |
| M-114 | wizard › display-photo step | skip the display photo or go back | both | 7 | components/common/OnboardingWizard/DisplayPictureStep.tsx:21 |
| M-115 | wizard › display-photo step | pick an existing item matched from the photo | both | 8 | components/common/OnboardingWizard/machines.ts:610 |
| M-116 | wizard › analyzing | wait while AI reads the labels ("Analyzing...") | both | 8 | components/common/OnboardingWizard/ItemOnboarding.tsx:66 |
| M-117 | wizard › analyzing | wait while label analysis auto-retries, then fall back to the form | both | 8 | components/common/OnboardingWizard/machines.ts:215 |
| M-118 | wizard › analyzing | be warned the label could not be read, and fill the form by hand | both | 8 | components/common/OnboardingWizard/ItemOnboarding.tsx:150 |
| M-119 | wizard › quick add | see AI-filled name, details and confidence for a confident match | both | 8 | components/common/QuickAddCard.tsx:93 |
| M-120 | wizard › quick add | let the auto-add countdown add the item | both | 8 | components/common/QuickAddCard.tsx:77 |
| M-121 | wizard › quick add | pause the auto-add countdown | both | 8 | components/common/QuickAddCard.tsx:51 |
| M-122 | wizard › quick add | confirm the quick add now | both | 8 | components/common/QuickAddCard.tsx:12 |
| M-123 | wizard › quick add | open the full form to edit AI defaults instead | both | 8 | components/common/OnboardingWizard/ItemOnboarding.tsx:113 |
| M-124 | wizard › review form | edit AI-drafted attributes and save the new item | both | 8 | components/common/OnboardingWizard/OnboardingItemForm.tsx:132 |
| M-125 | wizard › adding | see the "Adding your item..." progress while it saves | both | 9 | components/common/OnboardingWizard/ItemOnboarding.tsx:67 |
| M-126 | wizard › adding | retry after the add to cellar failed | both | 9 | components/common/OnboardingWizard/ItemOnboarding.tsx:138 |
| M-127 | wizard › final prompt | choose to add another item (Yes) | both | 9 | components/common/OnboardingWizard/FinalPrompt.tsx:18 |
| M-128 | wizard › final prompt | finish and land on the new item or bottle page (No) | both | 9 | components/common/OnboardingWizard/FinalPrompt.tsx:15 |

### Places, map and menus

| id | route or surface | job | device | reach | source |
|---|---|---|---|---|---|
| M-129 | `/map` | see places around me, or around the area I pan to, on a map | both | 1 | components/map/core/MapView.tsx:1 |
| M-130 | `/map` | tap a map pin to open that place's details | both | 2 | components/map/maplibre/POISymbolLayer.tsx:140 |
| M-131 | `/map` | see clustered pins merge and split as I zoom | both | 1 | components/map/maplibre/POISymbolLayer.tsx:277 |
| M-132 | `/map` | jump the map to my current location | both | 2 | components/map/core/MapControls.tsx:364 |
| M-133 | `/map` | see where I am on the map | both | 1 | components/map/maplibre/UserLocationLayer.tsx:1 |
| M-134 | `/map` | switch the map between light and dark | both | 2 | components/map/core/MapControls.tsx:373 |
| M-135 | `/map` › search box | search places by typing a name | both | 2 | components/map/core/MapControls.tsx:211 |
| M-136 | `/map` › search box | clear what I typed in map search | both | 3 | components/map/core/MapControls.tsx:246 |
| M-137 | `/map` › search box | switch search between the whole world and this map view | both | 3 | components/map/core/MapControls.tsx:267 |
| M-138 | `/map` › search results | pick a search result and fly to that place | both | 3 | components/map/places/SearchResultsList.tsx:170 |
| M-139 | `/map` › search results | close the search results list | both | 3 | components/map/places/SearchResultsList.tsx:139 |
| M-140 | `/map` › filter | show only certain drink types on the map | both | 2 | components/map/core/MapFilter.tsx:226 |
| M-141 | `/map` › filter › more filters | open the extra filters panel | both | 2 | components/map/core/MapFilter.tsx:244 |
| M-142 | `/map` › filter › more filters | show only places with a minimum rating | both | 3 | components/map/core/MapFilter.tsx:435 |
| M-143 | `/map` › filter › more filters | show any, only unvisited, or only visited places | both | 3 | components/map/core/MapFilter.tsx:467 |
| M-144 | `/map` › filter › more filters | filter places by category chips | both | 3 | components/map/core/MapFilter.tsx:346 |
| M-145 | `/map` › filter › more filters | show only places from chosen tier lists | both | 3 | components/map/core/MapControls.tsx:334 |
| M-146 | `/map` › filter › more filters | reset all filters | both | 3 | components/map/core/MapFilter.tsx:571 |
| M-147 | `/map?tierLists=` | open the map already filtered to one tier list | both | deep link (from tier list page, 3) | components/tier-list/TierListViewPage.tsx:213 |
| M-148 | `/map?placeId=` | open the map with one place already selected | both | deep link only | components/map/hooks/useMapDeepLink.ts:50 |
| M-149 | `/map` › place drawer | read a place's name, categories, rating and menu count | both | 3 | components/map/places/PlaceDetailsContent.tsx:507 |
| M-150 | `/map` › place drawer | expand or collapse the drawer by dragging it | phone | 3 | components/map/places/PlaceDetailsDrawer.tsx:30 |
| M-151 | `/map` › place drawer | close the drawer | both | 3 | components/map/places/PlaceDetailsContent.tsx:444 |
| M-152 | `/map` › place drawer | open the full place page | both | 3 | components/map/places/PlaceDetailsContent.tsx:384 |
| M-153 | `/map` › place drawer | get directions to a place | both | 3 | components/map/places/PlaceDetailsContent.tsx:802 |
| M-154 | `/map` › place drawer | call a place | phone | 3 | components/map/places/PlaceDetailsContent.tsx:613 |
| M-155 | `/map` › place drawer | open a place's website | both | 3 | components/map/places/PlaceDetailsContent.tsx:630 |
| M-156 | `/map` › place drawer | share a place | both | 3 | components/map/places/PlaceDetailsContent.tsx:802 |
| M-157 | `/map` › place drawer | favourite or unfavourite a place | both | 3 | components/map/places/PlaceDetailsContent.tsx:802 |
| M-158 | `/map` › place drawer | mark a place visited or not visited | both | 3 | components/map/places/PlaceDetailsContent.tsx:802 |
| M-159 | `/map` › place drawer | add a place to a tier list | both | 3 | components/map/places/PlaceDetailsContent.tsx:802 |
| M-160 | `/map` › place drawer | see how many menu items a place has, or that none are found | both | 3 | components/map/places/PlaceDetailsContent.tsx:671 |
| M-161 | `/map` › add place pin | enter place-adding mode to drop a pin | both | 2 | components/map/core/MapControls.tsx:351 |
| M-162 | `/map` › add place pin | leave place-adding mode without placing | both | 3 | components/map/core/MapControls.tsx:353 |
| M-163 | `/map` › add place pin | confirm the pin position and continue to the create form | both | 3 | components/map/places/CenterPinOverlay.tsx:99 |
| M-164 | `/map` › add place pin | cancel pin placement | both | 3 | components/map/places/CenterPinOverlay.tsx:107 |
| M-165 | `/map/create-place` | see the chosen location previewed on the form | both | 4 | components/map/places/CreatePlaceForm.tsx:415 |
| M-166 | `/map/create-place` | go back to the map without saving | both | 4 | components/map/places/CreatePlaceForm.tsx:415 |
| M-167 | `/map/create-place` | search Google for the place to prefill the form | both | 4 | components/map/places/GooglePlaceSearch.tsx:80 |
| M-168 | `/map/create-place` | accept a suggested Google match for my place | both | 4 | components/map/places/GooglePlaceSuggestions.tsx:88 |
| M-169 | `/map/create-place` | dismiss the suggested Google matches | both | 4 | components/map/places/GooglePlaceSuggestions.tsx:99 |
| M-170 | `/map/create-place` | enter name, categories, address, phone, website and description | both | 4 | components/map/places/CreatePlaceForm.tsx:778 |
| M-171 | `/map/create-place` | pick an existing place when a duplicate is flagged | both | 4 | components/map/places/DuplicatePlaceCheck.tsx:76 |
| M-172 | `/map/create-place` | confirm my place is new despite a flagged duplicate | both | 4 | components/map/places/DuplicatePlaceCheck.tsx:87 |
| M-173 | `/map/create-place` | save the new place (blocked until duplicates are settled) | both | 4 | components/map/places/CreatePlaceForm.tsx:778 |
| M-174 | `/places/[placeId]` | read a place's name, categories, status and enrichment state | both | deep link (from drawer, 4) | components/map/places/PlaceDetails.tsx:505 |
| M-175 | `/places/[placeId]` | view the place on the map | both | 4 | components/map/places/PlaceDetails.tsx:520 |
| M-176 | `/places/[placeId]` | get directions, call, or open the website | both | 4 | components/map/places/PlaceDetails.tsx:623 |
| M-177 | `/places/[placeId]` | favourite or unfavourite the place | both | 4 | components/map/places/PlaceDetails.tsx:657 |
| M-178 | `/places/[placeId]` | mark the place visited or unmark it | both | 4 | components/map/places/PlaceDetails.tsx:674 |
| M-179 | `/places/[placeId]` | share the place by system share sheet or copied link | both | 4 | components/map/places/PlaceDetails.tsx:293 |
| M-180 | `/places/[placeId]` | add the place to a tier list from a modal | both | 4 | components/map/places/PlaceDetails.tsx:703 |
| M-181 | `/places/[placeId]` › Menu tab | browse the menu items found for the place | both | 4 | components/map/places/PlaceMenuItems.tsx:125 |
| M-182 | `/places/[placeId]` › Menu tab | load more menu items | both | 4 | components/map/places/PlaceMenuItems.tsx:297 |
| M-183 | `/places/[placeId]` › Menu tab | open the matched item from a menu line | both | 5 | components/map/places/PlaceMenuItems.tsx:264 |
| M-184 | `/places/[placeId]` › Menu tab | see AI analysis of a menu item in a modal | both | 5 | components/map/places/PlaceMenuItems.tsx:309 |
| M-185 | `/places/[placeId]` › Menu tab | be told no menu has been found yet | both | 4 | components/map/places/PlaceDetails.tsx:826 |
| M-186 | `/places/[placeId]` › Camera Scan tab | take a photo of a menu with the camera | phone | 5 | components/map/scanning/MenuScanner.tsx:225 |
| M-187 | `/places/[placeId]` › Camera Scan tab | choose a menu photo from my files | both | 5 | components/map/scanning/MenuScanner.tsx:234 |
| M-188 | `/places/[placeId]` › Camera Scan tab | start scanning the chosen menu photo | both | 5 | components/map/scanning/MenuScanner.tsx:293 |
| M-189 | `/places/[placeId]` › Camera Scan tab | discard the chosen photo and start over | both | 5 | components/map/scanning/MenuScanner.tsx:303 |
| M-190 | `/places/[placeId]` › Camera Scan tab | watch upload, analysis and matching progress | both | 5 | components/map/scanning/MenuScanner.tsx:324 |
| M-191 | `/places/[placeId]` › Camera Scan tab | see that a scan finished or failed, and open its results | both | 5 | components/map/scanning/MenuScanner.tsx:368 |
| M-192 | `/places/[placeId]` › Info tab | read a place's details (categories, confidence, price level) | both | 4 | components/map/places/PlaceDetails.tsx:793 |
| M-193 | `/map/scans/[scanId]` | watch a menu scan process until it is done | both | deep link (from scan tab, 6) | components/map/scanning/MenuScanResults.tsx:256 |
| M-194 | `/map/scans/[scanId]` | read the extracted menu lines grouped by category | both | 6 | components/map/scanning/MenuScanResults.tsx:295 |
| M-195 | `/map/scans/[scanId]` | open the item a menu line matched to | both | 7 | components/map/scanning/MenuScanResults.tsx:377 |
| M-196 | `/map/scans/[scanId]` | accept an AI-suggested match for a menu line | both | 6 | components/map/scanning/MenuScanResults.tsx:391 |
| M-197 | `/map/scans/[scanId]` | reject an AI-suggested match for a menu line | both | 6 | components/map/scanning/MenuScanResults.tsx:391 |
| M-198 | `/map/scans/[scanId]` | be told nothing was extracted | both | 6 | components/map/scanning/MenuScanResults.tsx:295 |
| M-199 | `/map/scans/[scanId]` | go back to the place on the map | both | 7 | components/map/scanning/MenuScanResults.tsx:478 |
| M-200 | `/map/scans` | see my past menu scans | both | ORPHAN | components/map/scanning/ScanHistory.tsx:102 |
| M-201 | `/map/scans` | open one past scan's results | both | ORPHAN | components/map/scanning/ScanHistory.tsx:119 |
| M-202 | `/map/scans` | load more past scans | both | ORPHAN | components/map/scanning/ScanHistory.tsx:175 |
| M-203 | `/map/scans` | be told I have no menu scans yet | both | ORPHAN | components/map/scanning/ScanHistory.tsx:102 |
| M-204 | `/discoveries` | switch between Pending Matches and Saved Places | both | ORPHAN | components/map/discovery/DiscoveryDashboard.tsx:255 |
| M-205 | `/discoveries` › Pending Matches | read AI-suggested matches with a confidence percentage | both | ORPHAN | components/map/discovery/DiscoveryDashboard.tsx:359 |
| M-206 | `/discoveries` › Pending Matches | open the place behind a suggestion | both | ORPHAN | components/map/discovery/DiscoveryDashboard.tsx:388 |
| M-207 | `/discoveries` › Pending Matches | accept a suggested match | both | ORPHAN | components/map/discovery/DiscoveryDashboard.tsx:392 |
| M-208 | `/discoveries` › Pending Matches | reject a suggested match | both | ORPHAN | components/map/discovery/DiscoveryDashboard.tsx:407 |
| M-209 | `/discoveries` › Pending Matches | be told "All caught up!" when none are waiting | both | ORPHAN | components/map/discovery/DiscoveryDashboard.tsx:288 |
| M-210 | `/discoveries` › Saved Places | see places I saved with when I last visited | both | ORPHAN | components/map/discovery/DiscoveryDashboard.tsx:437 |
| M-211 | `/discoveries` › Saved Places | open a saved place | both | ORPHAN | components/map/discovery/DiscoveryDashboard.tsx:540 |
| M-212 | `/discoveries` › Saved Places | load more saved places | both | ORPHAN | components/map/discovery/DiscoveryDashboard.tsx:556 |

### Social, recap, taste and tier lists

| id | route or surface | job | device | reach | source |
|---|---|---|---|---|---|
| M-213 | `/friends` | see my friends and be told when I have none | both | 1 | components/friend/FriendsClient.tsx:344 |
| M-214 | `/friends` | remove a friend | both | 2 | components/friend/FriendsClient.tsx:370 |
| M-215 | `/friends` | search for people by name | both | 1 | components/friend/FriendsClient.tsx:390 |
| M-216 | `/friends` | send a friend request to a search result | both | 2 | components/friend/FriendsClient.tsx:410 |
| M-217 | `/friends` | see requests sent to me and be told when there are none | both | 1 | components/friend/FriendsClient.tsx:428 |
| M-218 | `/friends` | accept a friend request | both | 2 | components/friend/FriendsClient.tsx:462 |
| M-219 | `/friends` | reject a friend request | both | 2 | components/friend/FriendsClient.tsx:454 |
| M-220 | `/friends` | see requests I sent and be told when there are none | both | 1 | components/friend/FriendsClient.tsx:473 |
| M-221 | `/friends` | cancel a request I sent | both | 2 | components/friend/FriendsClient.tsx:499 |
| M-222 | `/friends` | see a banner confirming or explaining a friend action, with retry | both | 2 | components/friend/FriendsClient.tsx:320 |
| M-223 | `/rankings` | see items ranked by score, with a grid of cards | both | 1 | components/ranking/RankingsClient.tsx:105 |
| M-224 | `/rankings` | switch between my scores and my friends' scores | both | 2 | components/ranking/RankingsFilter.tsx:33 |
| M-225 | `/rankings` | filter rankings by drink type | both | 2 | components/ranking/RankingsClient.tsx:107 |
| M-226 | `/rankings` | open a ranked item | both | 2 | components/ranking/RankingsClient.tsx:133 |
| M-227 | `/rankings` | load more ranked items by scrolling | both | 1 | components/ranking/RankingsClient.tsx:125 |
| M-228 | `/rankings` | be told rankings are empty (names the friends case) | both | 1 | components/ranking/RankingsClient.tsx:120 |
| M-229 | `/tier-lists` | see my tier lists and those shared with me | both | 1 | components/tier-list/TierListsPage.tsx:59 |
| M-230 | `/tier-lists` | start a new tier list | both | 2 | components/tier-list/TierListsPage.tsx:49 |
| M-231 | `/tier-lists` | open a tier list from its card | both | 2 | components/tier-list/TierListCard.tsx:48 |
| M-232 | `/tier-lists` | see a card's privacy, type and size at a glance | both | 1 | components/tier-list/TierListCard.tsx:40 |
| M-233 | `/tier-lists` | be told no tier lists were found | both | 1 | components/tier-list/TierListsPage.tsx:67 |
| M-234 | `/tier-lists/add` | name a tier list and describe it | both | 3 | components/tier-list/TierListForm.tsx:130 |
| M-235 | `/tier-lists/add` | choose private, friends or public | both | 3 | components/tier-list/TierListForm.tsx:158 |
| M-236 | `/tier-lists/add` | choose what the list holds (a drink type or places) | both | 3 | components/tier-list/TierListForm.tsx:170 |
| M-237 | `/tier-lists/add` | create the list and land on it | both | 3 | components/tier-list/TierListForm.tsx:193 |
| M-238 | `/tier-lists/[id]` | see items in six bands from Outstanding to Unrated | both | 2 | components/tier-list/constants.ts:14 |
| M-239 | `/tier-lists/[id]` | switch between Rankings and Insights tabs | both | 2 | components/tier-list/TierListViewPage.tsx:294 |
| M-240 | `/tier-lists/[id]` › Rankings | open an entry's item or place page | both | 3 | components/tier-list/TierListView.tsx:222 |
| M-241 | `/tier-lists/[id]` › Rankings | drag an entry to reorder it within a band | both | 2 | components/tier-list/TierListView.tsx:402 |
| M-242 | `/tier-lists/[id]` › Rankings | drag an entry into another band | both | 2 | components/tier-list/TierListView.tsx:116 |
| M-243 | `/tier-lists/[id]` › Rankings | see my review score and the public rating on an entry | both | 2 | components/tier-list/TierListView.tsx:244 |
| M-244 | `/tier-lists/[id]` › Rankings | remove an entry, after a confirm | both | 3 | components/tier-list/TierListView.tsx:308 |
| M-245 | `/tier-lists/[id]` | add an entry by searching items or places | both | 3 | components/tier-list/AddEntryModal.tsx:206 |
| M-246 | `/tier-lists/[id]` | pick a search result to put in the list | both | 4 | components/tier-list/AddEntryModal.tsx:265 |
| M-247 | `/tier-lists/[id]` | see the list on the map | both | 3 | components/tier-list/TierListViewPage.tsx:213 |
| M-248 | `/tier-lists/[id]` | share the list by system sheet or copied link | both | 3 | components/tier-list/TierListViewPage.tsx:228 |
| M-249 | `/tier-lists/[id]` | lock or unlock editing of the list (owner) | both | 3 | components/tier-list/TierListViewPage.tsx:242 |
| M-250 | `/tier-lists/[id]` | open the edit page for the list (owner) | both | 3 | components/tier-list/TierListViewPage.tsx:253 |
| M-251 | `/tier-lists/[id]` | read a list I do not own without editing controls | both | 2 | components/tier-list/TierListViewPage.tsx:193 |
| M-252 | `/tier-lists/[id]` › Insights | wait while AI insights generate | both | 3 | components/tier-list/insights/TierListInsightsPanel.tsx:148 |
| M-253 | `/tier-lists/[id]` › Insights | read a hot take on the list | both | 3 | components/tier-list/insights/TierListInsightsPanel.tsx:187 |
| M-254 | `/tier-lists/[id]` › Insights | read my palate profile and blind spots | both | 3 | components/tier-list/insights/TierListInsightsPanel.tsx:233 |
| M-255 | `/tier-lists/[id]` › Insights | read a suggestion for what to try next | both | 3 | components/tier-list/insights/TierListInsightsPanel.tsx:269 |
| M-256 | `/tier-lists/[id]` › Insights | see how entries spread across bands | both | 3 | components/tier-list/insights/BandDistributionChart.tsx:1 |
| M-257 | `/tier-lists/[id]` › Insights | see how entries split by category | both | 3 | components/tier-list/insights/CategoryDonutChart.tsx:1 |
| M-258 | `/tier-lists/[id]` › Insights | see which countries my entries come from | both | 3 | components/tier-list/insights/CountryHeatmap.tsx:1 |
| M-259 | `/tier-lists/[id]` › Insights | see my Palate Passport badges | both | 3 | components/tier-list/insights/PalatePassport.tsx:1 |
| M-260 | `/tier-lists/[id]/edit` | change the list's name, description, privacy or type | both | deep link (from list page, 4) | components/tier-list/EditTierListClient.tsx:1 |
| M-261 | `/tier-lists/[id]/edit` | delete the list, after a confirm | both | 4 | components/tier-list/DeleteTierListButton.tsx:65 |
| M-262 | item page, bottle page and place views | add this item or place to a tier list | both | 3 | components/tier-list/AddToTierListButton.tsx:35 |
| M-263 | add-to-tier-list dialog | pick one of my lists to put it in | both | 4 | components/tier-list/AddToTierListModal.tsx:256 |
| M-264 | add-to-tier-list dialog | see which lists already hold it, disabled | both | 4 | components/tier-list/AddToTierListModal.tsx:226 |
| M-265 | add-to-tier-list dialog | make a new list and add it in one step | both | 4 | components/tier-list/AddToTierListModal.tsx:319 |
| M-266 | add-to-tier-list dialog | cancel making a new list | both | 5 | components/tier-list/AddToTierListModal.tsx:339 |
| M-267 | `/brands` | browse brand cards | both | 1 | components/brand/BrandsListClient.tsx:127 |
| M-268 | `/brands` | search brands by name | both | 1 | components/brand/BrandsListClient.tsx:108 |
| M-269 | `/brands` | open a brand | both | 2 | components/brand/BrandsListClient.tsx:134 |
| M-270 | `/brands` | be told no brands were found | both | 1 | components/brand/BrandsListClient.tsx:127 |
| M-271 | `/brands/[id]` | read a brand's name, type and parent brand | both | 2 | components/brand/BrandDetails.tsx:224 |
| M-272 | `/brands/[id]` | open the parent brand or a child brand | both | 3 | components/brand/BrandDetails.tsx:259 |
| M-273 | `/brands/[id]` | see the brand's items and open one | both | 3 | components/brand/BrandDetails.tsx:340 |
| M-274 | `/brands/[id]` | show more of the brand's items | both | 3 | components/brand/BrandDetailsClient.tsx:49 |
| M-275 | `/brands/[id]` | see the brand's places and open one | both | 3 | components/brand/BrandDetails.tsx:384 |
| M-276 | `/brands/[id]` | be told the brand has no items or places yet | both | 2 | components/brand/BrandDetails.tsx:316 |

### Recipes and search

| id | route or surface | job | device | reach | source |
|---|---|---|---|---|---|
| M-277 | `/recipes` | browse recipe groups as a grid of cards | both | 1 | components/recipe/VirtualizedRecipeGroupGrid.tsx:157 |
| M-278 | `/recipes` | search recipes by name, description or tag | both | 1 | components/search/RecipeGroupSearch.tsx:207 |
| M-279 | `/recipes` | clear the recipe search text | both | 2 | components/search/RecipeGroupSearch.tsx:218 |
| M-280 | `/recipes` | filter recipes by category | both | 1 | components/search/RecipeGroupSearch.tsx:242 |
| M-281 | `/recipes` | filter recipes by base spirit | both | 1 | components/search/RecipeGroupSearch.tsx:259 |
| M-282 | `/recipes` | clear all recipe filters | both | 2 | components/search/RecipeGroupSearch.tsx:274 |
| M-283 | `/recipes` | retry a failed recipe load | both | 1 | components/search/RecipeGroupSearch.tsx:300 |
| M-284 | `/recipes` | load more recipe groups by scrolling | both | 1 | components/search/RecipeGroupSearch.tsx:318 |
| M-285 | `/recipes` | be told no recipe groups were found, with a clear-filters button | both | 1 | components/search/RecipeGroupSearch.tsx:335 |
| M-286 | `/recipes` | open a recipe group from its card | both | 2 | components/recipe/RecipeGroupCard.tsx:265 |
| M-287 | `/recipes/groups/[id]` | read the group's name and its top recipe | both | 2 | app/(authenticated)/recipes/groups/[groupId]/page.tsx:94 |
| M-288 | `/recipes/groups/[id]` | open all versions of the group | both | 3 | app/(authenticated)/recipes/groups/[groupId]/page.tsx:63 |
| M-289 | `/recipes/groups/[id]/versions` | switch between versions of a recipe by tab | both | 3 | components/recipe/RecipeVersionsTab.tsx:141 |
| M-290 | `/recipes/groups/[id]/versions` | see which version is the canonical one | both | 3 | components/recipe/RecipeVersionsTab.tsx:155 |
| M-291 | `/recipes/groups/[id]/versions` | upvote a version | both | 4 | components/recipe/RecipeVoteButtons.tsx:174 |
| M-292 | `/recipes/groups/[id]/versions` | downvote a version | both | 4 | components/recipe/RecipeVoteButtons.tsx:223 |
| M-293 | `/recipes/groups/[id]/versions` | be shown a version without a picture as "No Image" | both | 3 | components/recipe/RecipeVersionsTab.tsx:198 |
| M-294 | `/recipes/[id]` | read a recipe's ingredients | both | deep link (from group, 3) | components/recipe/RecipeDetails.tsx:215 |
| M-295 | `/recipes/[id]` | open an ingredient that names a specific item | both | 4 | components/recipe/RecipeIngredientList.tsx:116 |
| M-296 | `/recipes/[id]` | read a recipe's instructions | both | 3 | components/recipe/RecipeDetails.tsx:229 |
| M-297 | `/recipes/[id]` | open the canonical recipe from a variation | both | 4 | components/recipe/RecipeDetails.tsx:167 |
| M-298 | `/recipes/[id]` | share the recipe by system sheet or copied link | both | 3 | components/recipe/RecipeShare.tsx:42 |
| M-299 | `/recipes/[id]` | read other people's reviews of the recipe | both | 3 | components/recipe/RecipeReviews.tsx:95 |
| M-300 | `/recipes/[id]` | show more reviews | both | 3 | components/recipe/RecipeReviews.tsx:130 |
| M-301 | `/recipes/[id]` | write a score and a note as a review | both | 3 | components/recipe/AddRecipeReview.tsx:169 |
| M-302 | `/recipes/[id]` | change or delete my review | both | 3 | components/recipe/AddRecipeReview.tsx:242 |
| M-303 | `/recipes/ai-generator` | choose a photo of a recipe | both | ORPHAN | components/recipe/RecipePhotoProcessor.tsx:294 |
| M-304 | `/recipes/ai-generator` | extract recipes from the chosen photo | both | ORPHAN | components/recipe/RecipePhotoProcessor.tsx:308 |
| M-305 | `/recipes/ai-generator` | watch upload and extraction progress | both | ORPHAN | components/recipe/RecipePhotoProcessor.tsx:249 |
| M-306 | `/recipes/ai-generator` | stop an extraction in flight | both | ORPHAN | components/recipe/RecipePhotoProcessor.tsx:353 |
| M-307 | `/recipes/ai-generator` | read the extracted recipes, or the error | both | ORPHAN | components/recipe/AIRecipeGenerator.tsx:69 |
| M-308 | `/recipes/ai-generator` | be told uploads are unavailable in this build | both | ORPHAN | components/recipe/RecipePhotoProcessor.tsx:271 |
| M-309 | `/search` | search my collection and catalog by typing (debounced) | both | 1 | components/search/ClientSearchInterface.tsx:185 |
| M-310 | `/search` | clear the search text | both | 2 | components/search/ClientSearchInterface.tsx:204 |
| M-311 | `/search` | scan a barcode to find an item | phone | 2 | components/search/ClientSearchInterface.tsx:217 |
| M-312 | `/search` | cancel barcode scanning | both | 3 | components/search/ClientSearchInterface.tsx:362 |
| M-313 | `/search` | search by taking or choosing a photo of a label | both | 2 | components/search/ClientSearchInterface.tsx:230 |
| M-314 | `/search` | cancel photo search | both | 3 | components/search/ClientSearchInterface.tsx:389 |
| M-315 | `/search` | scan or photo-search via buttons shown under the box | both | 1 | components/search/ClientSearchInterface.tsx:242 |
| M-316 | `/search` results | see matching items as a card grid and open one | both | 2 | components/search/SearchResultGrid.tsx:29 |
| M-317 | `/search` results | be told no items matched my words, then go to Add | both | 2 | components/search/ServerSearchResults.tsx:51 |
| M-318 | `/search` results | be told no items matched my barcode, then go to Add | both | 3 | components/search/ServerBarcodeResults.tsx:41 |
| M-319 | `/search` results | be told no items matched my photo, then go to Add | both | 3 | components/search/ServerImageResults.tsx:78 |
| M-320 | `/search` results | be told photo search is unavailable here | both | 3 | components/search/ServerImageResults.tsx:60 |
| M-321 | `/search` results | be told my photo search has expired | both | 3 | components/search/ServerImageResults.tsx:61 |

### Notes (main)

Orphans (no link in `services/client/src` reaches the route; found by grep of `href`/`push` for the path):
- `/cellars/[id]` (M-051 to M-056): breadcrumb crumb goes to `/items`, not the bare path (`components/common/breadcrumbs.ts:50`). Check-in with "Just me" or "Me and friends" lives only here (`components/cellar-api/CheckInButton.tsx:134`).
- `/map/scans` (M-200 to M-203): only `/map/scans/[scanId]` is linked (`MenuScanner.tsx:407`, `ScanHistory.tsx:119`).
- `/discoveries` (M-204 to M-212): no inbound link.
- `/recipes/ai-generator` (M-303 to M-308): no inbound link.
- Not strictly orphans, reachable only by typing the URL or via a breadcrumb: the six `/{type}s` index pages (M-093 to M-095; `reach` says "breadcrumb only").
- Per the nav (`components/common/SideNavigationBar.tsx:116`), Rankings, Favorites, Recipes, Brands and Friends sit behind the "…" overflow on a phone; reach for those is 1 on desktop, 2 on phone.

Not rendered / not a job (not counted):
- No route, component or string for "recap" or "taste profile" exists (grep of `app` and `components` found none). The section name "Social, recap, taste" has no recap or taste jobs; the seed doc's taste-profile spec is not built.
- Server-side AI review step in `CreatePlaceForm` has no UI.
- `components/search/RecipeGroupSearch.tsx` is rendered on `/recipes` (`app/(authenticated)/recipes/page.tsx:53`), so it is live and counted.
- `RecipeVoteButtons` has four render variants (`:174`, `:223`, `:262`, `:300`, `:324`, `:368`); counted once as up and down.
- `RecipeDetailsCard` ingredient availability icons and favourite heart are removed (`RecipeDetails.tsx:73`).
- `/serwist/[path]`, `/api/auth/[...all]`, `/api/graphql` and `/~offline` are infrastructure; `/~offline` has no job rows (unverified whether it shows any control).

Unverified (reach values are my count of taps from the nearest nav entry, not measured in a browser):
- All `reach` numbers are estimates from code structure.
- Seed doc `docs/product/ux-inventory-2026-10.md` was used as a starting point only; rows are from code. Differences: check-in dialog and bottle `ItemCheckIns` shown only once `bottle.openAt !== null` (`components/item/CellarItemPageView.tsx:107`).
- Device column "phone" for camera capture is by intent (camera), not by a device gate in code; none found.
- Hover-only controls: not separately identified; unconfirmed. Confirm by grepping `:hover` and `onMouseEnter` in `components/`.
- Jobs that share (place, tier list, recipe) depend on `navigator.share` or clipboard; behaviour differs per browser. Unverified in a browser.
- Map deep link `?placeId=` handled by `components/map/hooks/useMapDeepLink.ts:50` only for true deep links, not programmatic selection.
- Map drawer drag distances (80 px) at `PlaceDetailsDrawer.tsx:30`.
- "See places near me" on `/search` depends on browser location; exact fallback unverified.

---

# Branch (`987681bc`)

### Shell and Home

| id | route or surface | job | device | reach | source |
|---|---|---|---|---|---|
| B-001 | tab bar | switch between Home, Cellar, Map and Me | phone | 0 | components/app/TabBar.tsx:126 |
| B-002 | side rail | switch between Home, Cellar, Map and Me | desktop | 0 | components/app/SideRail.tsx:40 |
| B-003 | tab bar / side rail ＋ button | open the capture camera from anywhere | both | 0 | components/app/TabBar.tsx:79 |
| B-004 | tab bar | tap the active tab to scroll to top | phone | 0 | components/app/TabBar.tsx:41 |
| B-005 | tab bar | tap the active tab again to return to its root | phone | 0 | components/app/TabBar.tsx:45 |
| B-006 | tab bar › Home | tap Home at its root to open search | phone | 0 | components/app/nav.ts:34 |
| B-007 | any page | skip to main content by keyboard | both | 0 | components/app/SkipLink.tsx:55 |
| B-008 | app bar | go back one page (or to the parent on a cold link) | both | 1 | components/app/AppBar.tsx:164 |
| B-009 | app bar breadcrumbs | jump to an ancestor page from the breadcrumb trail | desktop | 1 | components/app/AppBar.tsx:148 |
| B-010 | app bar › More actions | open a page's overflow actions (menu on desktop, sheet on phone) | both | 1 | components/app/AppBar.tsx:198 |
| B-011 | install dialog | install the app from the browser prompt | both | 0 | components/common/InstallPwaDialog.tsx:251 |
| B-012 | install dialog | follow Add to Home Screen steps on iOS | phone | 0 | components/common/InstallPwaDialog.tsx:196 |
| B-013 | install dialog | postpone install (Remind me later) or never show it again | both | 0 | components/common/InstallPwaDialog.tsx:241 |
| B-014 | /~offline | see that you are offline and retry | both | deep link only | app/~offline/page.tsx:27 |
| B-015 | /~offline | reload automatically when the connection returns | both | deep link only | app/~offline/page.tsx:20 |
| B-016 | route error boundary | retry a page that failed to load | both | 0 | components/shell/BoundaryError.tsx:51 |
| B-017 | not-found page | see a page is missing or not shared, with navigation kept | both | 0 | components/shell/NotFoundMessage.tsx:1 |
| B-018 | /sign-in | sign in with email and password | both | deep link only | components/auth/SignInApiClient.tsx:104 |
| B-019 | /sign-in | sign in with Google, Discord or Facebook | both | deep link only | components/auth/SocialButtons.tsx:84 |
| B-020 | /sign-in | reveal the password form when social-only mode is on | both | deep link only | components/auth/SignInApiClient.tsx:157 |
| B-021 | /sign-in | go to sign up from the sign-in card | both | deep link only | components/auth/SignInApiClient.tsx:127 |
| B-022 | /sign-in, /sign-up | land back on the page you were sent from after signing in | both | deep link only | components/auth/SignInApiClient.tsx:127 |
| B-023 | /sign-up | create an account with name, email and password | both | deep link only | components/auth/SignUpApiClient.tsx:176 |
| B-024 | /sign-up | create an account with Google, Discord or Facebook | both | deep link only | components/auth/SignUpApiClient.tsx:85 |
| B-025 | /sign-up | go to sign in from the sign-up card | both | deep link only | components/auth/SignUpApiClient.tsx:30 |
| B-026 | /invite/[token] (signed out) | see who invited you and join | both | deep link only | app/invite/[token]/page.tsx:63 |
| B-027 | /invite/[token] (signed in) | accept a friend invite with Add as a friend | both | deep link only | components/share/InviteView.tsx:57 |
| B-028 | /invite/[token] (signed in) | open Friends from an invite already used or your own | both | deep link only | components/share/InviteView.tsx:78 |
| B-029 | / (Home) | see a time-of-day greeting with your name | both | 0 | components/home/TodayHeader.tsx:38 |
| B-030 | / (Home) | see how many bottles across how many cellars | both | 0 | components/home/sections.tsx:57 |
| B-031 | / (Home) › search pill | open the search sheet from Home | both | 0 | components/home/TodayHeader.tsx:56 |
| B-032 | / (Home) › AI work tray | see label reads, menu scans, recipe photos and insights still running | both | 0 | components/home/HomeInbox.tsx:338 |
| B-033 | / (Home) › AI work tray | see why an AI job failed and Try again or Open it | both | 0 | components/home/HomeInbox.tsx:406 |
| B-034 | / (Home) › AI work tray | dismiss a failed AI job | both | 0 | components/home/HomeInbox.tsx:411 |
| B-035 | / (Home) › Waiting on you | confirm menu matches for a scan | both | 1 | components/home/HomeInbox.tsx:248 |
| B-036 | / (Home) › Waiting on you | check a finished label-read draft and add it | both | 1 | components/home/inbox.ts:8 |
| B-037 | / (Home) › Waiting on you | accept a friend request in place | both | 0 | components/home/HomeInbox.tsx:287 |
| B-038 | / (Home) › Waiting on you | open a request to see who it is from | both | 1 | components/home/HomeInbox.tsx:275 |
| B-039 | / (Home) › Waiting on you | open a finished menu, recipe or insights result | both | 1 | components/home/HomeInbox.tsx:298 |
| B-040 | / (Home) › Waiting on you | dismiss a finished result without opening it | both | 0 | components/home/HomeInbox.tsx:311 |
| B-041 | toast (AI job finished) | open, review or retry a job that settled elsewhere | both | 0 | components/home/AiJobWatcher.tsx:123 |
| B-042 | / (Home) › Continue | see your open bottles across cellars, newest first | both | 0 | components/home/ContinueShelf.tsx:100 |
| B-043 | / (Home) › Continue | pour from an open bottle | both | 1 | components/home/ContinueShelf.tsx:306 |
| B-044 | / (Home) › Continue | open a bottle's page from its card | both | 1 | components/home/ContinueShelf.tsx:288 |
| B-045 | / (Home) › Drink soon | see opened bottles past their typical life | both | 0 | components/home/ContinueShelf.tsx:130 |
| B-046 | / (Home) › Drink soon | pour from an opened bottle in Drink soon | both | 1 | components/home/ContinueShelf.tsx:170 |
| B-047 | / (Home) › Drink soon | see sealed bottles whose window ends within three months | both | 0 | components/home/ContinueShelf.tsx:198 |
| B-048 | / (Home) › Drink soon | open a sealed bottle to open it | both | 1 | components/home/ContinueShelf.tsx:214 |
| B-049 | / (Home) › empty state | start with Snap a bottle when you have no bottles | both | 1 | components/home/sections.tsx:152 |
| B-050 | / (Home) › Friends ranked | see friends' recent tier lists | both | 0 | components/home/sections.tsx:184 |
| B-051 | / (Home) › Friends ranked | open all tier lists (See all) | both | 1 | components/home/sections.tsx:187 |
| B-052 | / (Home) › Friends | read friends' ratings, logs and additions as sentences | both | 0 | components/home/FriendsFeed.tsx:228 |
| B-053 | / (Home) › Friends | open the item, list or person a sentence names | both | 1 | components/home/FriendsFeed.tsx:244 |
| B-054 | / (Home) › Friends | save a friend's item to Want to try from the feed | both | 0 | components/home/FriendsFeed.tsx:272 |
| B-055 | / (Home) › Friends | show more feed entries | both | 0 | components/home/FriendsFeed.tsx:155 |
| B-056 | / (Home) › Friends empty | invite a friend with no friends yet | both | 0 | components/home/FriendsFeed.tsx:122 |
| B-057 | / (Home) › Nearby | allow location to see nearby places | both | 0 | components/home/NearbySection.tsx:52 |
| B-058 | / (Home) › Nearby | decline location with Not now | both | 0 | components/home/NearbySection.tsx:49 |
| B-059 | / (Home) › Nearby | filter nearby places by type | both | 0 | components/search/NearbyPlaces.tsx:208 |
| B-060 | / (Home) › Nearby | open a nearby place on the map | both | 1 | components/search/NearbyPlaces.tsx:274 |
| B-061 | / (Home) › Nearby | open the map from See all | both | 1 | components/search/NearbyPlaces.tsx:346 |
| B-062 | /me | see your name, email and photo | both | 0 | components/user/MeHub.tsx:240 |
| B-063 | /me | see counts of bottles, logs, places and tier lists | both | 0 | components/user/MeHub.tsx:167 |
| B-064 | /me › Stamps | see your breadth stamps | both | 0 | components/user/MeStamps.tsx:45 |
| B-065 | /me › Stamps | open your recap | both | 1 | components/user/MeStamps.tsx:58 |
| B-066 | /me › Lists | open one of your three latest tier lists | both | 1 | components/user/MeHub.tsx:206 |
| B-067 | /me › Lists | open All tier lists or start one | both | 1 | components/user/MeHub.tsx:213 |
| B-068 | /me › Lists | open Top rated | both | 1 | components/user/MeHub.tsx:61 |
| B-069 | /me › Lists | open Taste profile | both | 1 | components/user/MeHub.tsx:64 |
| B-070 | /me › Lists | open Loved | both | 1 | components/user/MeHub.tsx:70 |
| B-071 | /me › Lists | open Want to try | both | 1 | components/user/MeHub.tsx:75 |
| B-072 | /me › People | open Friends and see a pending-request count | both | 1 | components/user/MeHub.tsx:83 |
| B-073 | /me › Settings | open Edit profile | both | 1 | components/user/MeHub.tsx:279 |
| B-074 | /users/edit | change your display name | both | 2 | components/user/EditProfileClient.tsx:91 |
| B-075 | /me › Settings | sign out | both | 1 | components/user/SignOutButton.tsx:42 |


### Cellars and items

| id | route or surface | job | device | reach | source |
|---|---|---|---|---|---|
| B-076 | /cellars | See my cellars, friends' cellars and discoverable cellars as sections | both | 1 | app/(authenticated)/cellars/(list)/page.tsx:1 |
| B-077 | /cellars | Switch between Cellars and Bar | both | 1 | components/cellar/CellarSegments.tsx:25 |
| B-078 | /cellars | Show more cards in a cellar section | both | 1 | components/common/CollectionSection.tsx:97 |
| B-079 | /cellars | Open a cellar from its card | both | 1 | components/cellar/CellarCard.tsx:87 |
| B-080 | /cellars | See a cellar's owners and per-type counts on its card | both | 1 | components/cellar/CellarCard.tsx:87 |
| B-081 | /cellars | Edit a cellar from its card (owners and co-owners only) | both | 1 | components/cellar/CellarCard.tsx:102 |
| B-082 | /cellars | Start a new cellar from the header Add cellar button | both | 1 | components/cellar/Cellars.tsx:144 |
| B-083 | /cellars (empty) | Start my first cellar from the empty state | both | 1 | components/cellar/Cellars.tsx:62 |
| B-084 | /cellars/add | Name a cellar, set its privacy and pick co-owners, then create it | both | 2 | components/cellar/CellarForm.tsx:1 |
| B-085 | /cellars/add | Land on the new cellar after creating it | both | 2 | components/cellar/AddCellarClient.tsx:1 |
| B-086 | /cellars/[id]/edit | Rename, change privacy or co-owners of a cellar | both | 3 | components/cellar/EditCellarClient.tsx:1 |
| B-087 | /cellars/[id]/edit | Delete a cellar after confirming (a refusal is shown) | both | 3 | components/cellar-api/DeleteCellarButton.tsx:1 |
| B-088 | /cellars/[id]/items | See a cellar's dashboard: Open now, Drink soon, stat tiles, pour trend, Recently added | both | 2 | components/cellar/CellarDashboard.tsx:139 |
| B-089 | /cellars/[id]/items | Open a bottle from the Open now shelf | both | 2 | components/cellar/CellarDashboard.tsx:139 |
| B-090 | /cellars/[id]/items | Open a bottle from Recently added | both | 2 | components/cellar/CellarDashboard.tsx:158 |
| B-091 | /cellars/[id]/items | See what to drink soon, with links (owners and co-owners only) | both | 2 | components/cellar/CellarDashboard.tsx:46 |
| B-092 | /cellars/[id]/items | Jump from a stat tile to the matching list (In the cellar, Open, Almost empty, Finished this month) | both | 2 | components/cellar/dashboard.ts:130 |
| B-093 | /cellars/[id]/items | Pour from a bottle card in the cellar (owners and co-owners) | both | 2 | components/cellar/PourButton.tsx:107 |
| B-094 | /cellars/[id]/items | Check in a bottle I do not own the cellar of | both | 2 | components/cellar/PourButton.tsx:107 |
| B-095 | /cellars/[id]/items | Read a bottle's count and level on its card | both | 2 | components/cellar/BottleCard.tsx:17 |
| B-096 | /cellars/[id]/items | Search this cellar from the header | both | 2 | components/cellar/CellarItemsControls.tsx:166 |
| B-097 | /cellars/[id]/items | Filter the collection by status: In cellar, Finished, All | both | 2 | components/cellar/CellarItemsControls.tsx:185 |
| B-098 | /cellars/[id]/items | Filter the collection by item type chips | both | 2 | components/cellar/CellarItemsFilter.tsx:58 |
| B-099 | /cellars/[id]/items | Sort the collection: Open first, Recently added, Almost empty, A-Z, Best match, Latest finished | both | 2 | components/cellar/CellarItemsControls.tsx:199 |
| B-100 | /cellars/[id]/items | Open a bottle from the collection grid | both | 2 | components/cellar/CellarItemsGrid.tsx:375 |
| B-101 | /cellars/[id]/items | Read the finished diary and show more of it | both | 2 | components/cellar/FinishedDiary.tsx:135 |
| B-102 | /cellars/[id]/items | Open a finished bottle from the diary | both | 2 | components/cellar/FinishedDiary.tsx:181 |
| B-103 | /cellars/[id]/items | See matches in my other cellars when a search finds none here | both | 2 | components/cellar/CellarSearchElsewhere.tsx:41 |
| B-104 | /cellars/[id]/items (empty) | Snap a bottle from the empty collection | both | 2 | components/cellar/CellarItemsEmpty.tsx:149 |
| B-105 | /cellars/[id]/items | Add an item from the header Add item button (disabled when I cannot add) | both | 2 | components/cellar/AddItemButton.tsx:1 |
| B-106 | /cellars/[id]/items | Edit the cellar from the header overflow menu | both | 3 | components/cellar/CellarItemsControls.tsx:157 |
| B-107 | /cellars/[id]/items/add | Pick Beer, Wine, Spirit, Coffee, Sake or Tea to add to this cellar | both | 3 | components/cellar/AddItemClient.tsx:1 |
| B-108 | /cellars/[id]/{beers,wines,spirits,coffees,sakes,teas}/add | Add an item of a given type to this cellar | both | deep link only | app/(authenticated)/cellars/[cellarId]/wines/add/page.tsx:1 |
| B-109 | /wines/[itemId] etc. | Open an item's page (any of six types) | both | via search, shelf or link | components/item/ItemPage.tsx:1 |
| B-110 | /cellars/[id]/wines/[itemId] etc. | Open one bottle's page: the item page with that bottle selected | both | via cellar | components/item/CellarItemPage.tsx:1 |
| B-111 | item page | Go back to the parent, or to the cellar | both | page | components/item/ItemAppBar.tsx:52 |
| B-112 | item page | Mark an item Loved from its hero | both | page | components/item/LoveButton.tsx:63 |
| B-113 | item page | Open the producer's brand page from the hero | both | page | components/item/ItemHero.tsx:55 |
| B-114 | item page | Set a new display photo for my bottle | both | page | components/item/AddPhoto.tsx:103 |
| B-115 | item page | Add a photo prompt after capture: Add photo or Dismiss | both | page | components/item/AddPhoto.tsx:174 |
| B-116 | item page | Read You, Friends and Everyone ratings and open each | both | page | components/item/TasteHeader.tsx:30 |
| B-117 | item page | Pour (or Steep or Brew) from the action bar | both | page | components/item/ItemActionBar.tsx:129 |
| B-118 | item page | Log a drink from the action bar when I have no bottle | both | page | components/item/ItemActionBar.tsx:139 |
| B-119 | item page | Add this item to one of my cellars | both | page | components/item/ItemActionBar.tsx:148 |
| B-120 | item page | Save or unsave this item to Want to try | both | page | components/item/ItemActionBar.tsx:156 |
| B-121 | item page | Open more actions from the action bar | both | page | components/item/ItemActionBar.tsx:163 |
| B-122 | item page | Add this item to a tier list from More actions | both | page | components/item/header-actions.ts:30 |
| B-123 | item page | Share this item from More actions | both | page | components/item/header-actions.ts:30 |
| B-124 | item page | Edit the item from More actions (creator only) | both | page | components/item/header-actions.ts:33 |
| B-125 | item page | Delete this bottle from More actions (cellar owner, bottle URL only) | both | page | components/item/header-actions.ts:34 |
| B-126 | Add to cellar sheet | Choose which cellar to add to | both | page | components/item/AddToCellarActions.tsx:332 |
| B-127 | Add to cellar sheet | Set how many bottles to add | both | page | components/item/AddToCellarActions.tsx:392 |
| B-128 | Add to cellar sheet | Mark the bottle as already open | both | page | components/item/AddToCellarActions.tsx:97 |
| B-129 | Add to cellar sheet | Add the bottle or bottles | both | page | components/item/AddToCellarActions.tsx:340 |
| B-130 | Add to cellar | Undo an add ("Taking them back out") | both | page | components/item/AddToCellarActions.tsx:205 |
| B-131 | Another bottle added dialog | Be offered a re-buy note after adding another bottle of the same item | both | page | components/item/AddToCellarActions.tsx:446 |
| B-132 | Photo of this bottle dialog | Save a photo to my photos or add a photo of this bottle after adding | both | page | components/item/AddToCellarActions.tsx:463 |
| B-133 | Your bottles | See every bottle of this item in my cellars and open one | both | page | components/item/YourBottles.tsx:116 |
| B-134 | Your bottles | Pour from a specific bottle | both | page | components/item/YourBottles.tsx:130 |
| B-135 | Your bottles | Log a drink from a specific bottle | both | page | components/item/YourBottles.tsx:147 |
| B-136 | Pour sheet | Set how much I poured by the bottle's level or a plain slider | both | page | components/pour/PourLevel.tsx:173 |
| B-137 | Pour sheet | Pick a glass preset (or The rest) | both | page | components/pour/PourSheet.tsx:526 |
| B-138 | Pour sheet | Choose who I poured with: Just me, a friend, Others | both | page | components/drink-log/CompanionPicker.tsx:72 |
| B-139 | Pour sheet | Back-date the pour with When | both | page | components/drink-log/WhenPicker.tsx:90 |
| B-140 | Pour sheet | Log the pour and update the level (and open a sealed bottle) | both | page | components/pour/PourSheet.tsx:371 |
| B-141 | Pour sheet | Retry a failed pour | both | page | components/pour/PourSheet.tsx:371 |
| B-142 | Pour sheet | Undo a pour from its toast | both | page | components/pour/PourSheet.tsx:305 |
| B-143 | Pour sheet, last pour | Say Finished, emptying the bottle | both | page | components/pour/PourSheet.tsx:385 |
| B-144 | Pour sheet, last pour | Say Not yet, leaving a drop (toast with Undo) | both | page | components/pour/PourSheet.tsx:402 |
| B-145 | Pour sheet, rate step | Rate the item and save or update the rating | both | page | components/pour/PourSheet.tsx:760 |
| B-146 | Pour sheet, rate step | Skip rating or keep my rating | both | page | components/pour/PourSheet.tsx:776 |
| B-147 | Pour sheet, band step | Move the item to the tier band its rating suggests, with Undo | both | page | components/pour/PourSheet.tsx:935 |
| B-148 | Your bottles / selected bottle | Set the remaining level with a slider and save it | both | page | components/item/ItemRemainingSlider.tsx:176 |
| B-149 | selected bottle | Mark a sealed bottle as opened (cellar owner) | both | page | components/item/ItemRemainingSlider.tsx:140 |
| B-150 | selected bottle | Finish a bottle: confirm Finished or Not yet | both | page | components/item/FinishBottleDialogs.tsx:46 |
| B-151 | selected bottle | Undo a finish from its toast | both | page | components/item/FinishBottleDialogs.tsx:100 |
| B-152 | selected bottle | Restore a finished bottle to the cellar | both | page | components/item/ItemRemainingSlider.tsx:192 |
| B-153 | Delete bottle dialog | Delete the bottle | both | page | components/item/DeleteBottleDialog.tsx:125 |
| B-154 | Delete bottle dialog | Mark finished instead of deleting | both | page | components/item/DeleteBottleDialog.tsx:116 |
| B-155 | Delete bottle dialog | Cancel deleting | both | page | components/item/DeleteBottleDialog.tsx:146 |
| B-156 | selected bottle | See this bottle's drinking window, dates, price and place | both | page | components/item/BottleFreshnessFields.tsx:339 |
| B-157 | Bottle freshness sheet | Edit Bought, Packaged, drink-from and drink-until dates | both | page | components/item/BottleFreshnessFields.tsx:159 |
| B-158 | Bottle freshness sheet | Edit price, currency and where it lives, then save | both | page | components/item/BottleFreshnessFields.tsx:244 |
| B-159 | Your log | Read my drink log for this item | both | page | components/drink-log/YourLog.tsx:241 |
| B-160 | Your log | Log a drink from the Your log header or empty state | both | page | components/drink-log/YourLog.tsx:204 |
| B-161 | Log a drink sheet | Score the glass | both | page | components/drink-log/LogDrinkSheet.tsx:318 |
| B-162 | Log a drink sheet | Write a tasting note | both | page | components/drink-log/LogDrinkSheet.tsx:454 |
| B-163 | Log a drink sheet | Accept a suggested flavour tag drawn from my note | both | page | components/drink-log/LogDrinkSheet.tsx:485 |
| B-164 | Log a drink sheet | Add or remove my own flavour tags | both | page | components/drink-log/LogDrinkSheet.tsx:525 |
| B-165 | Log a drink sheet | Say who I drank with | both | page | components/drink-log/CompanionPicker.tsx:72 |
| B-166 | Log a drink sheet | Say when I had it (Now or a date) | both | page | components/drink-log/WhenPicker.tsx:90 |
| B-167 | Log a drink sheet | Say where I was by picking a place | both | page | components/drink-log/LogDrinkSheet.tsx:624 |
| B-168 | Log a drink sheet | Add or remove a photo of the glass | both | page | components/drink-log/LogDrinkSheet.tsx:762 |
| B-169 | Log a drink sheet | Save the log (Log it, or Save when editing) or cancel | both | page | components/drink-log/LogDrinkSheet.tsx:236 |
| B-170 | Your log row | Open actions for a log row | both | page | components/drink-log/YourLog.tsx:291 |
| B-171 | Your log row | Edit a log | both | page | components/drink-log/YourLog.tsx:328 |
| B-172 | Your log row | Delete a log and undo the delete ("Log restored") | both | page | components/drink-log/YourLog.tsx:349 |
| B-173 | item page | Read, add or edit my How to steep or brew values (tea and coffee) | both | page | components/item/BrewGuideSection.tsx:91 |
| B-174 | item page | Run a steep timer from the guide | both | page | components/item/BrewGuideSection.tsx:156 |
| B-175 | item page | Read the item's facts | both | page | components/item/ItemFacts.tsx:1 |
| B-176 | item page | See cocktails that use this item | both | page | components/item/ItemPageView.tsx:240 |
| B-177 | item page | Open a recipe from Cook with this | both | page | components/item/ItemRecipes.tsx:96 |
| B-178 | item page | Write, edit or delete my review | both | page | components/review/AddReview.tsx:178 |
| B-179 | item page | Read others' reviews and show more | both | page | components/item/ItemReviews.tsx:136 |
| B-180 | item page | Add or change the item's brand | both | page | components/item/ChangeBrand.tsx:89 |
| B-181 | Brand sheet | Save the brand, then undo from the toast | both | page | components/item/ChangeBrand.tsx:70 |
| B-182 | item page | See where this item was seen on menus and open the place | both | page | components/item/SeenAtSection.tsx:124 |
| B-183 | item page, no sightings | Scan a menu from the Seen at prompt | both | page | components/item/SeenAtSection.tsx:109 |
| B-184 | item page | See which of my cellars hold it and open one | both | page | components/item/ItemCellars.tsx:43 |
| B-185 | item page | See tier lists it is on and open one | both | page | components/item/ItemTierLists.tsx:74 |
| B-186 | item page | Read a note that something was held back | both | page | components/item/HeldBackNote.tsx:1 |
| B-187 | item page, visitor | Read a read-only "This bottle" row for someone else's bottle | both | page | components/item/ItemPageView.tsx:150 |
| B-188 | /{type}/[itemId]/edit | Edit an item's details and save | both | page | components/item/ItemForm.tsx:323 |
| B-189 | item edit | Re-read the label from the stored photos | both | page | components/item/ItemCorrectionPanel.tsx:222 |
| B-190 | item edit | Suggest details for empty fields (may decline) | both | page | components/item/ItemCorrectionPanel.tsx:233 |
| B-191 | item edit | Apply a suggested value by tapping its chip, then save | both | page | components/item/ItemCorrectionPanel.tsx:114 |
| B-192 | /cellars/[id]/{type}/[itemId]/edit | Edit a bottle's item from the cellar route | both | page | components/item/CellarItemEditPage.tsx:1 |

### Capture and onboarding

| id | route or surface | job | device | reach | source |
|---|---|---|---|---|---|
| B-193 | /add | Open the camera from the ＋ button (tab bar hides) | both | 1 | components/app/nav.ts:34 |
| B-194 | /add | Pick a capture mode: Bottle, Menu or Recipe (last used is remembered) | both | 1 | components/capture/CaptureSurface.tsx:111 |
| B-195 | /add | Pick which item type I am adding | both | 1 | components/capture/TypePicker.tsx:36 |
| B-196 | /add | Close capture and go back | both | 1 | components/capture/CaptureChrome.tsx:25 |
| B-197 | /add camera | Take a photo with the shutter | both | 1 | components/capture/CaptureCamera.tsx:261 |
| B-198 | /add camera | Choose a photo from the library instead | both | 1 | components/capture/CaptureCamera.tsx:251 |
| B-199 | /add camera | Turn the torch on or off | phone | 1 | components/capture/CaptureCamera.tsx:270 |
| B-200 | /add camera | Retry or choose from library when the camera cannot start | both | 1 | components/capture/CaptureCamera.tsx:193 |
| B-201 | /add camera | Have a barcode read from the live picture before the shutter | both | 1 | components/capture/CaptureCamera.tsx:226 |
| B-202 | /add Bottle | Pick a catalog item from "Is it one of these?" after a barcode read | both | 1 | components/common/OnboardingWizard/index.tsx:149 |
| B-203 | /add Bottle | Skip the barcode match and carry on to the photo | both | 1 | components/common/OnboardingWizard/index.tsx:154 |
| B-204 | /add Bottle | Skip the photo of a chosen catalog item | both | 1 | components/common/OnboardingWizard/index.tsx:120 |
| B-205 | /add Bottle | Go back a step | both | 1 | components/common/OnboardingWizard/index.tsx:127 |
| B-206 | /add Bottle | Type the details in instead of photographing | both | 1 | components/common/OnboardingWizard/index.tsx:138 |
| B-207 | /add Bottle | Read a label photo I carried in (Read this label, or Retake) | both | deep link only | components/common/OnboardingWizard/ItemOnboarding.tsx:416 |
| B-208 | /add Bottle | Wait for the label read, or keep going in the background | both | 1 | components/common/OnboardingWizard/ItemOnboarding.tsx:478 |
| B-209 | /add Bottle | Be told a backgrounded read is done or failed (toast) | both | 1 | components/common/OnboardingWizard/ItemOnboarding.tsx:251 |
| B-210 | /add Bottle | Try again after a failed read | both | 1 | components/common/OnboardingWizard/ItemOnboarding.tsx:497 |
| B-211 | /add Bottle | Scan the photo as a menu when the read says it is a menu | both | 1 | components/common/OnboardingWizard/ItemOnboarding.tsx:564 |
| B-212 | /add Bottle | Retake the photo | both | 1 | components/common/OnboardingWizard/ItemOnboarding.tsx:568 |
| B-213 | /add Bottle draft | Say "Is it this one? +1 bottle" to file another bottle of a catalog match | both | 1 | components/common/OnboardingWizard/CatalogMatchPrompt.tsx:34 |
| B-214 | /add Bottle draft | Say "No, it's new" to a catalog match | both | 1 | components/common/OnboardingWizard/CatalogMatchPrompt.tsx:37 |
| B-215 | /add Bottle draft | Choose an item the photo looks like ("Looks like") | both | 1 | components/common/OnboardingWizard/MatchList.tsx:51 |
| B-216 | /add Bottle draft | Say "None of these, it's new" to photo matches | both | 1 | components/common/OnboardingWizard/ItemOnboarding.tsx:591 |
| B-217 | /add Bottle draft | Add a back label photo to improve the read | both | 1 | components/common/OnboardingWizard/ItemOnboarding.tsx:612 |
| B-218 | /add Bottle draft | Pick which cellar the bottle goes into, or Just the catalog | both | 1 | components/capture/CellarPicker.tsx:1 |
| B-219 | /add Bottle draft | Check and edit the fields the read filled in | both | 1 | components/common/OnboardingWizard/OnboardingItemForm.tsx:72 |
| B-220 | /add Bottle draft | Pick or create the brand on the form | both | 1 | components/common/OnboardingWizard/OnboardingItemForm.tsx:75 |
| B-221 | /add Bottle draft | Type a barcode into the form | both | 1 | components/common/OnboardingWizard/OnboardingItemForm.tsx:76 |
| B-222 | /add Bottle draft | Add the item (Add) | both | 1 | components/common/OnboardingWizard/OnboardingItemForm.tsx:280 |
| B-223 | /add Bottle quick add | Confirm a countdown quick-add, or pause it by editing | both | 1 | components/common/QuickAddCard.tsx:271 |
| B-224 | /add Bottle quick add | Edit instead of auto-adding | both | 1 | components/common/QuickAddCard.tsx:263 |
| B-225 | /add Bottle success | Snap another (or Add another) | both | 1 | components/capture/SuccessSheet.tsx:73 |
| B-226 | /add Bottle success | Open the bottle now (open and pour) | both | 1 | components/capture/SuccessSheet.tsx:78 |
| B-227 | /add Bottle success | View the bottle or item | both | 1 | components/capture/SuccessSheet.tsx:82 |
| B-228 | /add?draft=id | Resume a read left running in the background | both | 1 (via Home) | app/(authenticated)/add/(index)/page.tsx:12 |
| B-229 | /add Menu | Scan a menu photo from anywhere | both | 1 | components/capture/MenuCapture.tsx:227 |
| B-230 | /add Menu | Confirm the nearest place ("At X?") with Yes, I'm here | both | 1 | components/capture/MenuCapture.tsx:430 |
| B-231 | /add Menu | Say Somewhere else | both | 1 | components/capture/MenuCapture.tsx:437 |
| B-232 | /add Menu | Change the confirmed place | both | 1 | components/capture/MenuCapture.tsx:410 |
| B-233 | /add Menu | Pick the place when location is unavailable | both | 1 | components/capture/MenuCapture.tsx:450 |
| B-234 | /add Menu | Allow location after the app's one-line reason | both | 1 | components/capture/MenuCapture.tsx:46 |
| B-235 | Place picker sheet | Search places by name | both | 1 | components/capture/MenuCapture.tsx:641 |
| B-236 | Place picker sheet | Pick one of the places near me | both | 1 | components/capture/MenuCapture.tsx:684 |
| B-237 | Place picker sheet | Add a place that is not listed (sheet) | both | 1 | components/capture/MenuCapture.tsx:626 |
| B-238 | Place picker sheet | Go to the full create-place page for an unlisted place | both | 1 | components/capture/MenuCapture.tsx:618 |
| B-239 | New place sheet | Name the new place and pick its category | both | 1 | components/capture/NewPlaceSheet.tsx:205 |
| B-240 | New place sheet | Add the place and send the scan | both | 1 | components/capture/NewPlaceSheet.tsx:175 |
| B-241 | New place sheet | Go back to picking a nearby place | both | 1 | components/capture/NewPlaceSheet.tsx:184 |
| B-242 | /add Menu | Be told the menu is being read, or was not sent, with Try again | both | 1 | components/capture/MenuCapture.tsx:171 |
| B-243 | /add Recipe | Snap a recipe photo | both | 1 | components/capture/RecipeCapture.tsx:93 |
| B-244 | /add Recipe | Read this recipe from the photo (Try again on failure) | both | 1 | components/capture/RecipeCapture.tsx:128 |
| B-245 | /add Recipe | Stop a recipe read in progress | both | 1 | components/capture/RecipeCapture.tsx:156 |
| B-246 | /add Recipe | Open the draft recipe once read | both | 1 | components/capture/RecipeCapture.tsx:190 |
| B-247 | /add Recipe | Go to Recipes when reading is not available | both | 1 | components/capture/RecipeCapture.tsx:77 |
| B-248 | /add/[itemType] | Add an item of a given type with the camera fixed to that type | both | deep link only | app/(authenticated)/add/[itemType]/page.tsx:1 |
| B-249 | /cellars/[id]/items/add and /{type}/add | Capture a bottle straight into this cellar | both | 2 | components/capture/PinnedCellarCapture.tsx:1 |
| B-250 | pinned cellar capture | Be told I may not add here instead of getting a camera | both | 2 | components/capture/PinnedCellarCapture.tsx:22 |

### Places, map and menus

| id | route or surface | job | device | reach | source |
|---|---|---|---|---|---|
| B-251 | /map | See places on a map and pan or zoom it | both | 1 | components/map/maplibre/MapLibreRenderer.tsx:1 |
| B-252 | /map | Search places by name in the viewport | both | 1 | components/map/core/MapControls.tsx:222 |
| B-253 | /map | Switch search to global (Google) rather than viewport | both | 1 | components/map/core/MapControls.tsx:245 |
| B-254 | /map | Clear the search | both | 1 | components/map/core/MapControls.tsx:234 |
| B-255 | /map | Read search results in a list and close them | both | 1 | components/map/places/SearchResultsList.tsx:87 |
| B-256 | /map | Pick a search result to open that place | both | 1 | components/map/places/SearchResultsList.tsx:157 |
| B-257 | /map (no results) | Add the searched place from the empty state | both | 1 | components/map/places/SearchEmptyState.tsx:27 |
| B-258 | /map | Filter places by minimum rating | both | 1 | components/map/core/MapFilter.tsx:295 |
| B-259 | /map | Filter places by visit status: Any, New Places, Visited | both | 1 | components/map/core/MapFilter.tsx:309 |
| B-260 | /map | Filter places by one of my tier lists | both | 1 | components/map/core/MapFilter.tsx:322 |
| B-261 | /map | Filter places by category | both | 1 | components/map/core/MapFilter.tsx:1 |
| B-262 | /map | See and remove active filters | both | 1 | components/map/core/MapFilter.tsx:109 |
| B-263 | /map | Jump to my location | both | 1 | components/map/core/MapControls.tsx:315 |
| B-264 | /map | Switch the map between light and dark | both | 1 | components/map/core/MapControls.tsx:327 |
| B-265 | /map | Start placing a new place with the center pin, or cancel | both | 1 | components/map/core/MapControls.tsx:302 |
| B-266 | /map | Allow location after the one-line reason, or dismiss it | both | 1 | components/map/core/LocationPrePrompt.tsx:51 |
| B-267 | /map | Dismiss a map error banner | both | 1 | components/map/core/MapErrorBanner.tsx:32 |
| B-268 | /map?placeId=id | Open a place on the map from a link | both | deep link only | components/map/core/MapWrapper.tsx:1 |
| B-269 | Place drawer (map) | Read a place's summary, hours and details from a map tap | both | 2 | components/map/places/PlaceDetailsDrawer.tsx:1 |
| B-270 | Place drawer (map) | Close place details | both | 2 | components/map/places/PlaceDetailsContent.tsx:388 |
| B-271 | Place drawer (map) | Open the full place page | both | 2 | components/map/places/PlaceDetailsContent.tsx:345 |
| B-272 | Place drawer (map) | Get directions | both | 2 | components/map/places/PlaceDetailsContent.tsx:700 |
| B-273 | Place drawer (map) | Call the place | both | 2 | components/map/places/PlaceDetailsContent.tsx:810 |
| B-274 | Place drawer (map) | Visit the place's website | both | 2 | components/map/places/PlaceDetailsContent.tsx:715 |
| B-275 | Place drawer (map) | Love a place | both | 2 | components/map/places/PlaceDetailsContent.tsx:832 |
| B-276 | Place drawer (map) | Mark a place visited or not visited | both | 2 | components/map/places/PlaceDetailsContent.tsx:844 |
| B-277 | Place drawer (map) | Share a place (copies the link) | both | 2 | components/map/places/PlaceDetailsContent.tsx:748 |
| B-278 | Place drawer (map) | Add a place to a tier list | both | 2 | components/map/places/PlaceDetailsContent.tsx:753 |
| B-279 | Place drawer (map) | Scan a menu when none is discovered | both | 2 | components/map/places/PlaceDetailsContent.tsx:601 |
| B-280 | Place drawer (map) | Read the menu items of a place | both | 2 | components/map/places/PlaceDetailsContent.tsx:568 |
| B-281 | /places/[id] | Read a place page: hero, status badge, Menu, Scan menu and Info tabs | both | 2 | components/map/places/PlaceDetails.tsx:1 |
| B-282 | /places/[id] | Show the place on the map | both | 2 | components/map/places/PlaceDetails.tsx:473 |
| B-283 | /places/[id] | Get directions | both | 2 | components/map/places/PlaceDetails.tsx:543 |
| B-284 | /places/[id] | Call the place | both | 2 | components/map/places/PlaceDetails.tsx:549 |
| B-285 | /places/[id] | Visit the place's website | both | 2 | components/map/places/PlaceDetails.tsx:558 |
| B-286 | /places/[id] | Save the place to Want to try | both | 2 | components/map/places/PlaceDetails.tsx:575 |
| B-287 | /places/[id] | Mark the place visited | both | 2 | components/map/places/PlaceActionButtons.tsx:129 |
| B-288 | /places/[id] | Love the place | both | 2 | components/map/places/PlaceActionButtons.tsx:102 |
| B-289 | /places/[id] | Share the place (copies the link) | both | 2 | components/map/places/PlaceDetails.tsx:595 |
| B-290 | /places/[id] | Add the place to a tier list | both | 2 | components/map/places/PlaceDetails.tsx:605 |
| B-291 | /places/[id] Menu tab | Read the menu lines grouped by type | both | 2 | components/map/places/PlaceMenuItems.tsx:63 |
| B-292 | /places/[id] Menu tab | Load more menu lines | both | 2 | components/map/places/PlaceMenuItems.tsx:74 |
| B-293 | /places/[id] Scan menu tab | Take a menu photo or choose a file | both | 2 | components/map/scanning/MenuScanner.tsx:256 |
| B-294 | /places/[id] Scan menu tab | Scan the menu, or pick a different photo | both | 2 | components/map/scanning/MenuScanner.tsx:306 |
| B-295 | /places/[id] Scan menu tab | Check again on a slow scan | both | 2 | components/map/scanning/MenuScanner.tsx:364 |
| B-296 | /places/[id] Scan menu tab | View results of a scan or scan another menu | both | 2 | components/map/scanning/MenuScanner.tsx:413 |
| B-297 | /places/[id] Info tab | Read address, hours, phone and website | both | 2 | components/map/places/PlaceDetails.tsx:742 |
| B-298 | /places/[id] | See the owner's review status of a place I added | both | 2 | components/map/places/PlaceReviewPanel.tsx:92 |
| B-299 | /places/[id] | Edit (or Edit and resubmit) a place I added | both | 2 | components/map/places/PlaceReviewPanel.tsx:211 |
| B-300 | /places/[id] | Delete a place I added after confirming | both | 2 | components/map/places/PlaceReviewPanel.tsx:216 |
| B-301 | /places/[id] | Add a suggested category to my place | both | 2 | components/map/places/PlaceReviewPanel.tsx:352 |
| B-302 | /places/[id] | Dismiss suggested categories | both | 2 | components/map/places/PlaceReviewPanel.tsx:334 |
| B-303 | /places/[id] | Use a suggested description | both | 2 | components/map/places/PlaceReviewPanel.tsx:374 |
| B-304 | /map/create-place | Create a place: name, categories, address, phone, website, description | both | 2 | components/map/places/CreatePlaceForm.tsx:622 |
| B-305 | /map/create-place | Search Google for the place to pre-fill the form | both | 2 | components/map/places/GooglePlaceSearch.tsx:111 |
| B-306 | /map/create-place | Pick a nearby Google suggestion ("This is it") or enter details manually | both | 2 | components/map/places/GooglePlaceSuggestions.tsx:73 |
| B-307 | /map/create-place | Pick a similar existing place or create a new one anyway | both | 2 | components/map/places/DuplicatePlaceCheck.tsx:69 |
| B-308 | /map/create-place | Submit the place (Add Place) | both | 2 | components/map/places/CreatePlaceForm.tsx:907 |
| B-309 | /map/create-place | Go back to the map | both | 2 | components/map/places/CreatePlaceForm.tsx:527 |
| B-310 | /places/[id]/edit | Edit my place's details and send it for review | both | 3 | components/map/places/CreatePlaceForm.tsx:507 |
| B-311 | /places/[id]/edit | Read why a place was not approved | both | 3 | components/map/places/CreatePlaceForm.tsx:546 |
| B-312 | /map/scans/[scanId] | Read the results of a menu scan with status and progress | both | 1 (via Home) | components/map/scanning/MenuScanResults.tsx:361 |
| B-313 | /map/scans/[scanId] | Accept a suggested match for a menu line | both | 1 (via Home) | components/map/scanning/MenuScanResults.tsx:332 |
| B-314 | /map/scans/[scanId] | Reject a suggested match for a menu line | both | 1 (via Home) | components/map/scanning/MenuScanResults.tsx:321 |
| B-315 | /map/scans/[scanId] | Rename the place to the menu header, or keep its name | both | 1 (via Home) | components/map/scanning/HeaderRenameOffer.tsx:78 |
| B-316 | /map/scans/[scanId] | Check again on a slow read | both | 1 (via Home) | components/map/scanning/MenuScanResults.tsx:397 |
| B-317 | /map/scans/[scanId] | Go back to the place on the map | both | 1 (via Home) | components/map/scanning/MenuScanResults.tsx:449 |
| B-318 | Menu line sheet | Open a menu line to see what it matched and why it suits me | both | 2 | components/menu-lines/MenuLineRow.tsx:94 |
| B-319 | Menu line sheet | Log a drink of the matched item | both | 2 | components/menu-lines/MenuLineSheet.tsx:339 |
| B-320 | Menu line sheet | Save the matched item to Want to try | both | 2 | components/menu-lines/MenuLineSheet.tsx:344 |
| B-321 | Menu line sheet | Add the matched item to a cellar | both | 2 | components/menu-lines/MenuLineSheet.tsx:350 |
| B-322 | Menu line sheet | Add the matched item to a tier list | both | 2 | components/menu-lines/MenuLineSheet.tsx:357 |
| B-323 | Menu line sheet | Say "Not this" and unlink a wrong match (with Undo) | both | 2 | components/menu-lines/MenuLineSheet.tsx:367 |
| B-324 | Menu line sheet | Pick a candidate ("That's it") for an unmatched line, with Undo | both | 2 | components/menu-lines/MenuLineSheet.tsx:209 |
| B-325 | Menu line sheet | Try again when candidates fail to load | both | 2 | components/menu-lines/MenuLineSheet.tsx:162 |
| B-326 | Menu line sheet | Find a recipe for a cocktail line | both | 2 | components/menu-lines/MenuLineSheet.tsx:407 |
| B-327 | Menu line sheet | Add a missing line to the catalog | both | 2 | components/menu-lines/MenuLineSheet.tsx:392 |
| B-328 | Add to catalog sheet | Say what the line is, fill in details and add it | both | 2 | components/menu-lines/MenuLineDraftSheet.tsx:425 |
| B-329 | Add to catalog sheet | Show all details | both | 2 | components/menu-lines/MenuLineDraftSheet.tsx:507 |
| B-330 | Add to catalog sheet | Suggest details with AI | both | 2 | components/menu-lines/MenuLineDraftSheet.tsx:518 |

### Social, recap, taste and tier lists

| id | route or surface | job | device | reach | source |
|---|---|---|---|---|---|
| B-331 | /friends | share my invite link through the share sheet or copy it | both | 1 (Me) | components/share/InviteFriendsCard.tsx:109 |
| B-332 | /friends | reset my invite link so old links stop working | both | 1 (Me) | components/share/InviteFriendsCard.tsx:123 |
| B-333 | /friends reset sheet | confirm or cancel the invite reset | both | 1 (Me) | components/share/InviteFriendsCard.tsx:131 |
| B-334 | /friends | see my friends and open one's profile | both | 1 (Me) | components/friend/FriendsClient.tsx:494 |
| B-335 | /friends | remove a friend after a confirm sheet | both | 1 (Me) | components/friend/FriendsClient.tsx:500 |
| B-336 | /friends | search people by name to add as friends | both | 1 (Me) | components/friend/FriendsClient.tsx:518 |
| B-337 | /friends | send a friend request from search results | both | 1 (Me) | components/friend/FriendsClient.tsx:531 |
| B-338 | /friends | accept an incoming request from the banner when they already asked me | both | 1 (Me) | components/friend/FriendsClient.tsx:345 |
| B-339 | /friends | accept an incoming friend request | both | 1 (Me) | components/friend/FriendsClient.tsx:568 |
| B-340 | /friends | reject an incoming friend request | both | 1 (Me) | components/friend/FriendsClient.tsx:561 |
| B-341 | /friends | cancel a request I sent | both | 1 (Me) | components/friend/FriendsClient.tsx:592 |
| B-342 | /friends | retry a friends or requests list that failed to load | both | 1 (Me) | components/friend/FriendsClient.tsx:101 |
| B-343 | /friends | see new requests arrive without reloading (polled) | both | 1 (Me) | components/friend/FriendsClient.tsx:291 |
| B-344 | Me hub › People › Friends | see how many friend requests are waiting (badge) | both | 0 | components/user/me-hub-data.ts:89 |
| B-345 | /invite/[token] signed out | see who invited me and why to join | both | deep link only | app/invite/[token]/page.tsx:60 |
| B-346 | /invite/[token] signed out | sign up to connect with the inviter, returning here | both | deep link only | components/share/ShareFrame.tsx:67 |
| B-347 | /invite/[token] signed out | sign in instead, returning here | both | deep link only | components/share/ShareFrame.tsx:44 |
| B-348 | /invite/[token] signed in | add the inviter as a friend in one tap | both | deep link only | components/share/InviteView.tsx:57 |
| B-349 | /invite/[token] signed in | learn it is my own link or we are already friends | both | deep link only | components/share/InviteHero.tsx:29 |
| B-350 | /invite/[token] signed in | go to Friends after accepting or when nothing to do | both | deep link only | components/share/InviteView.tsx:78 |
| B-351 | /invite/[token] dead link | see an invite link is reset or never existed | both | deep link only | app/invite/[token]/not-found.tsx:1 |
| B-352 | /users | land on Me when a profile crumb is followed | both | deep link only | app/(authenticated)/users/page.tsx:9 |
| B-353 | /users/[userId] | see a friend's name and "friends since" date | both | 2 (Me › Friends) | components/profile/FriendProfile.tsx:38 |
| B-354 | /users/[userId] | see the tier lists a friend shares with me | both | 2 (Me › Friends) | components/profile/FriendSections.tsx:126 |
| B-355 | /users/[userId] | see the cellars a friend shares with me | both | 2 (Me › Friends) | components/profile/FriendSections.tsx:155 |
| B-356 | /users/[userId] | page through a friend's lists or cellars (Show more) | both | 2 (Me › Friends) | components/profile/FriendSections.tsx:91 |
| B-357 | /users/[userId] | read a friend's recent drink logs with score and flavours | both | 2 (Me › Friends) | components/profile/FriendLog.tsx:72 |
| B-358 | /users/[userId] | open the item a friend logged | both | 2 (Me › Friends) | components/profile/FriendLog.tsx:93 |
| B-359 | /users/[userId] | page through a friend's logs (Show more) | both | 2 (Me › Friends) | components/profile/FriendLog.tsx:142 |
| B-360 | /users/[userId] | see "Nothing shared yet." for a friend who shares nothing | both | 2 (Me › Friends) | components/profile/FriendProfile.tsx:48 |
| B-361 | /users/[userId] | see a stranger or missing id as "isn't shared with you" | both | deep link only | app/(authenticated)/users/[userId]/page.tsx:55 |
| B-362 | /users/[userId] | land on Me when I open my own id | both | deep link only | app/(authenticated)/users/[userId]/page.tsx:41 |
| B-363 | /users/[userId]#compare | see how many items we agree on, as a count | both | 2 (Me › Taste profile) | components/taste/TasteCompareSection.tsx:79 |
| B-364 | /users/[userId]#compare | copy a friend's tier list to my own private lists | both | 2 (Me › Friends) | components/taste/CloneTierListButton.tsx:58 |
| B-365 | toast after copy | undo a copied tier list (deletes the copy) | both | 2 (Me › Friends) | components/taste/CloneTierListButton.tsx:44 |
| B-366 | /users/[userId]#compare | page through the friend's lists to copy (Show more) | both | 2 (Me › Friends) | components/taste/TasteCompareSection.tsx:121 |
| B-367 | /users/edit | change my display name and save | both | 1 (Me › Edit profile) | components/user/EditProfileClient.tsx:37 |
| B-368 | Me hub › Stamps | see my breadth stamps for new styles, regions and recipes | both | 0 | components/user/MeStamps.tsx:41 |
| B-369 | Me hub › Stamps | open this month's recap | both | 1 | components/user/MeStamps.tsx:58 |
| B-370 | /recap | step through recap cards by tapping the card | both | 1 (Me › recap) | components/recap/RecapDeck.tsx:204 |
| B-371 | /recap | see what was new to me, my types, styles, regions and recipes | both | 1 (Me › recap) | components/recap/recap-copy.ts:53 |
| B-372 | /recap | see my top rated of the period | both | 1 (Me › recap) | components/recap/recap-copy.ts:98 |
| B-373 | /recap | see a breadth stamp I earned on its own card | both | 1 (Me › recap) | components/recap/recap-copy.ts:107 |
| B-374 | /recap | share one card as an image (no link, nothing public) | both | 1 (Me › recap) | components/recap/RecapDeck.tsx:250 |
| B-375 | /recap | save the card image to the device when sharing is unavailable | both | 1 (Me › recap) | components/recap/share-card.ts:54 |
| B-376 | /recap | close the recap and return to Me | both | 1 (Me › recap) | components/recap/RecapDeck.tsx:182 |
| B-377 | /recap empty month | see "too little logged" and jump to my year | both | 1 (Me › recap) | components/recap/RecapDeck.tsx:308 |
| B-378 | /recap | retry a recap that failed to load | both | 1 (Me › recap) | components/recap/RecapDeck.tsx:289 |
| B-379 | /recap?period=YYYY or YYYY-MM | open a chosen month or year recap | both | deep link only | components/recap/RecapDeck.tsx:70 |
| B-380 | /api/recap/[owner]/[period]/[card] | fetch a recap card as an image file | both | deep link only | app/api/recap/[owner]/[period]/[card]/route.tsx:1 |
| B-381 | /taste-profile | see my archetype and the styles I love | both | 1 (Me) | components/taste/TasteProfileView.tsx:184 |
| B-382 | /taste-profile | learn how many more ratings unlock an archetype | both | 1 (Me) | components/taste/TasteProfileView.tsx:187 |
| B-383 | /taste-profile | see what my taste is built from, by type, with counts | both | 1 (Me) | components/taste/TasteProfileView.tsx:76 |
| B-384 | /taste-profile | see how much I agree with each friend | both | 1 (Me) | components/taste/TasteProfileView.tsx:114 |
| B-385 | /taste-profile | open a friend's compare section from their row | both | 2 (Me › Taste profile) | components/taste/TasteProfileView.tsx:149 |
| B-386 | /taste-profile no friends | go to Friends to add someone to compare with | both | 2 (Me › Taste profile) | components/taste/TasteProfileView.tsx:119 |
| B-387 | /rankings | see top-rated items ranked with a rank numeral | both | 1 (Me › Top rated) | components/ranking/RankingsClient.tsx:206 |
| B-388 | /rankings | switch whose scores count: Me, Friends or Everyone | both | 1 (Me › Top rated) | components/ranking/RankingsClient.tsx:166 |
| B-389 | /rankings | filter the board by item type | both | 1 (Me › Top rated) | components/ranking/RankingsClient.tsx:172 |
| B-390 | /rankings | open a ranked item | both | 2 (Me › Top rated) | components/ranking/RankingsClient.tsx:214 |
| B-391 | /rankings empty | follow the empty state's one action | both | 1 (Me › Top rated) | components/ranking/RankingsClient.tsx:196 |
| B-392 | item page taste header | compare my score with friends' average and everyone's | both | 2 (Cellar › item) | components/item/TasteHeader.tsx:17 |
| B-393 | /tier-lists | see my lists, ordered by last change | both | 1 (Me › Tier lists) | components/tier-list/TierListsPage.tsx:123 |
| B-394 | /tier-lists | see tier lists from friends | both | 1 (Me › Tier lists) | components/tier-list/TierListsPage.tsx:123 |
| B-395 | /tier-lists | discover public tier lists from other people | both | 1 (Me › Tier lists) | components/tier-list/TierListsPage.tsx:123 |
| B-396 | /tier-lists | open a tier list from its card | both | 2 (Me › Tier lists) | components/tier-list/TierListCard.tsx:64 |
| B-397 | /tier-lists | start a new tier list | both | 2 (Me › Tier lists) | components/tier-list/TierListsPage.tsx:112 |
| B-398 | /tier-lists empty | start my first list from "Nothing ranked yet." | both | 2 (Me › Tier lists) | components/tier-list/TierListsPage.tsx:36 |
| B-399 | /tier-lists | page through more lists in a section | both | 1 (Me › Tier lists) | components/tier-list/TierListsPage.tsx:82 |
| B-400 | /tier-lists | come back to the scroll position I left | both | 1 (Me › Tier lists) | components/tier-list/TierListsPage.tsx:104 |
| B-401 | Me hub › Lists | open a pinned tier list straight from Me | both | 1 | components/user/MeHub.tsx:204 |
| B-402 | Me hub › Lists | open all tier lists from Me | both | 1 | components/user/MeHub.tsx:212 |
| B-403 | /tier-lists/add | name a list, describe it, set privacy and list type | both | 3 (Me › Tier lists › New) | components/tier-list/TierListForm.tsx:216 |
| B-404 | /tier-lists/add | start the list pre-ranked from my ratings (switch, on by default) | both | 3 (Me › Tier lists › New) | components/tier-list/TierListForm.tsx:301 |
| B-405 | /tier-lists/add | create the list and land on it | both | 3 (Me › Tier lists › New) | components/tier-list/TierListForm.tsx:330 |
| B-406 | /tier-lists/[id] | read a list banded Outstanding to Unrated, in rank order | both | 2 (Me › Tier lists) | components/tier-list/TierListView.tsx:413 |
| B-407 | /tier-lists/[id] | see the owner's, my own and the public rating per entry | both | 2 (Me › Tier lists) | components/tier-list/TierListView.tsx:240 |
| B-408 | /tier-lists/[id] | open an entry's item or place page | both | 3 (Me › Tier lists) | components/tier-list/TierListView.tsx:224 |
| B-409 | /tier-lists/[id]?item= | land on one entry scrolled into view | both | deep link only | components/tier-list/TierListViewPage.tsx:7 |
| B-410 | /tier-lists/[id] | switch between Rankings and Insights tabs | both | 2 (Me › Tier lists) | components/tier-list/TierListViewPage.tsx:92 |
| B-411 | /tier-lists/[id] place list | view the list's places on the map | both | 2 (Me › Tier lists) | components/tier-list/TierListViewPage.tsx:430 |
| B-412 | /tier-lists/[id] | share the list link, or be told how to make it shareable | both | 2 (Me › Tier lists) | components/tier-list/TierListViewPage.tsx:451 |
| B-413 | /tier-lists/[id] | open the edit page for my list | both | 2 (Me › Tier lists) | components/tier-list/TierListViewPage.tsx:463 |
| B-414 | /tier-lists/[id] empty | add the first entry from "Nothing ranked yet." | both | 2 (Me › Tier lists) | components/tier-list/TierListViewPage.tsx:388 |
| B-415 | /tier-lists/[id] | enter Arrange mode to edit my list | both | 2 (Me › Tier lists) | components/tier-list/TierListViewPage.tsx:494 |
| B-416 | Arrange mode | drag an entry to another band or position | both | 2 (Me › Tier lists) | components/tier-list/TierListView.tsx:355 |
| B-417 | Arrange mode | reorder an entry by keyboard | desktop | 2 (Me › Tier lists) | components/tier-list/TierListView.tsx:568 |
| B-418 | Arrange mode | remove an entry from the list | both | 2 (Me › Tier lists) | components/tier-list/TierListView.tsx:274 |
| B-419 | toast after remove | undo a removed entry | both | 2 (Me › Tier lists) | components/tier-list/TierListView.tsx:217 |
| B-420 | Arrange bar | undo the last list edit, as far back as the history goes | both | 2 (Me › Tier lists) | components/tier-list/TierListViewPage.tsx:526 |
| B-421 | Arrange bar | redo an edit I undid | both | 2 (Me › Tier lists) | components/tier-list/TierListViewPage.tsx:534 |
| B-422 | Arrange mode | undo or redo with Cmd/Ctrl-Z and Shift-Cmd/Ctrl-Z | desktop | 2 (Me › Tier lists) | components/tier-list/TierListViewPage.tsx:308 |
| B-423 | edit toast | undo or redo from the toast naming the edit | both | 2 (Me › Tier lists) | components/tier-list/TierListViewPage.tsx:293 |
| B-424 | Arrange bar | open Add entry from the bar | both | 2 (Me › Tier lists) | components/tier-list/TierListViewPage.tsx:542 |
| B-425 | Arrange bar | finish arranging (Done) | both | 2 (Me › Tier lists) | components/tier-list/TierListViewPage.tsx:556 |
| B-426 | Add entry sheet | pick from what is in my cellars | both | 3 (Me › Tier lists › Add) | components/tier-list/AddEntryModal.tsx:455 |
| B-427 | Add entry sheet | pick from what I tasted but have not ranked | both | 3 (Me › Tier lists › Add) | components/tier-list/AddEntryModal.tsx:455 |
| B-428 | Add entry sheet | pick what friends ranked highly | both | 3 (Me › Tier lists › Add) | components/tier-list/AddEntryModal.tsx:455 |
| B-429 | Add entry sheet | see why each row is suggested and which band it lands in | both | 3 (Me › Tier lists › Add) | components/tier-list/AddEntryModal.tsx:572 |
| B-430 | Add entry sheet | show more rows in a section | both | 3 (Me › Tier lists › Add) | components/tier-list/AddEntryModal.tsx:476 |
| B-431 | Add entry sheet | search for an item or place not suggested | both | 3 (Me › Tier lists › Add) | components/tier-list/AddEntryModal.tsx:306 |
| B-432 | Add entry sheet | clear my search | both | 3 (Me › Tier lists › Add) | components/tier-list/AddEntryModal.tsx:318 |
| B-433 | Add entry sheet | add several picks as one edit ("Add N entries") | both | 3 (Me › Tier lists › Add) | components/tier-list/AddEntryModal.tsx:290 |
| B-434 | toast after add | undo the whole multi-add in one tap | both | 3 (Me › Tier lists › Add) | components/tier-list/TierListViewPage.tsx:363 |
| B-435 | Add entry sheet | compare one rated pick against list entries to place it | both | 3 (Me › Tier lists › Add) | components/tier-list/AddEntryModal.tsx:282 |
| B-436 | Pairwise placement | choose which of two I like more | both | 4 | components/tier-list/pairwise/PairwisePlacement.tsx:428 |
| B-437 | Pairwise placement | say "About the same" to place it next to the rival | both | 4 | components/tier-list/pairwise/PairwisePlacement.tsx:451 |
| B-438 | Pairwise placement | skip and put it at the end of its band | both | 4 | components/tier-list/pairwise/PairwisePlacement.tsx:459 |
| B-439 | Pairwise placement | see progress through the questions | both | 4 | components/tier-list/pairwise/PairwisePlacement.tsx:405 |
| B-440 | Pairwise placement | see where it landed (band, rank, between which) | both | 4 | components/tier-list/pairwise/PairwisePlacement.tsx:243 |
| B-441 | Pairwise placement | undo the placement | both | 4 | components/tier-list/pairwise/PairwisePlacement.tsx:281 |
| B-442 | Pairwise placement | place directly when the band is empty or after an undo | both | 4 | components/tier-list/pairwise/PairwisePlacement.tsx:328 |
| B-443 | Pairwise placement | retry a failed placement or start over | both | 4 | components/tier-list/pairwise/PairwisePlacement.tsx:336 |
| B-444 | Pairwise placement | close the sheet when done | both | 4 | components/tier-list/pairwise/PairwisePlacement.tsx:271 |
| B-445 | /tier-lists/[id] Insights | see how my entries spread across bands | both | 3 (Me › Tier lists › Insights) | components/tier-list/insights/TierListInsightsPanel.tsx:211 |
| B-446 | /tier-lists/[id] Insights | see a palate passport (place lists) | both | 3 (Me › Tier lists › Insights) | components/tier-list/insights/TierListInsightsPanel.tsx:248 |
| B-447 | /tier-lists/[id] Insights | see a country heatmap (place lists) | both | 3 (Me › Tier lists › Insights) | components/tier-list/insights/TierListInsightsPanel.tsx:255 |
| B-448 | /tier-lists/[id] Insights | see a category donut (place lists) | both | 3 (Me › Tier lists › Insights) | components/tier-list/insights/TierListInsightsPanel.tsx:232 |
| B-449 | /tier-lists/[id] Insights | read an AI take, palate profile and blind spots | both | 3 (Me › Tier lists › Insights) | components/tier-list/insights/TierListInsightsPanel.tsx:238 |
| B-450 | /tier-lists/[id] Insights | wait for insights to generate, polled | both | 3 (Me › Tier lists › Insights) | components/tier-list/insights/TierListInsightsPanel.tsx:122 |
| B-451 | /tier-lists/[id] Insights | see why insights are unavailable (AI status notice) | both | 3 (Me › Tier lists › Insights) | components/tier-list/insights/TierListInsightsPanel.tsx:190 |
| B-452 | /tier-lists/[id] Insights | see a style to explore, with a catalog lookup | both | 3 (Me › Tier lists › Insights) | components/tier-list/insights/TierListInsightsPanel.tsx:275 |
| B-453 | /tier-lists/[id] Insights | see up to six catalog cards to try next, with a reason | both | 3 (Me › Tier lists › Insights) | components/tier-list/TryNextCards.tsx:168 |
| B-454 | Try this next card | open a suggested item | both | 4 | components/tier-list/TryNextCards.tsx:213 |
| B-455 | Try this next card | save a suggestion to Want to try | both | 4 | components/tier-list/TryNextCards.tsx:203 |
| B-456 | Try this next (owner, empty) | learn what would fill the suggestions | both | 3 (Me › Tier lists › Insights) | components/tier-list/TryNextCards.tsx:55 |
| B-457 | /tier-lists/[id]/edit | rename the list and change its description and privacy | both | 3 (Me › Tier lists › Edit) | components/tier-list/TierListForm.tsx:216 |
| B-458 | /tier-lists/[id]/edit | save the changes | both | 3 (Me › Tier lists › Edit) | components/tier-list/TierListForm.tsx:332 |
| B-459 | /tier-lists/[id]/edit | delete the list after a confirm sheet (cannot be undone) | both | 3 (Me › Tier lists › Edit) | components/tier-list/DeleteTierListButton.tsx:61 |
| B-460 | item or place sheet | add this item to a tier list I own | both | 2 (item › Add to tier list) | components/tier-list/AddToTierListModal.tsx:317 |
| B-461 | Add to Tier List sheet | see which lists already hold it and in which band | both | 2 (item › Add to tier list) | components/tier-list/AddToTierListModal.tsx:5 |
| B-462 | Add to Tier List sheet | create a new list and add to it in one step | both | 2 (item › Add to tier list) | components/tier-list/AddToTierListModal.tsx:385 |
| B-463 | toast after add to list | undo adding an item to a list | both | 2 (item › Add to tier list) | components/tier-list/AddToTierListModal.tsx:173 |
| B-464 | /share/tier-lists/[id] | read a shared tier list signed out, banded | both | deep link only | components/share/SharedTierListView.tsx:155 |
| B-465 | /share/tier-lists/[id] | see a preview card when the link is pasted (OG image) | both | deep link only | app/share/tier-lists/[tierListId]/opengraph-image.tsx:1 |
| B-466 | /share/tier-lists/[id] signed in | land on the real tier list page | both | deep link only | app/share/tier-lists/[tierListId]/page.tsx:43 |
| B-467 | /share/items/[segment]/[itemId] | read a shared item (type, score, facts) signed out | both | deep link only | components/share/SharedItemView.tsx:96 |
| B-468 | /share/items/[segment]/[itemId] | see a preview card when pasted (OG image) | both | deep link only | app/share/items/[segment]/[itemId]/opengraph-image.tsx:1 |
| B-469 | /share/items/[segment]/[itemId] signed in | land on the real item page | both | deep link only | app/share/items/[segment]/[itemId]/page.tsx:62 |
| B-470 | /share/recipes/[recipeId] | read a shared recipe's ingredients and method signed out | both | deep link only | components/share/SharedRecipeView.tsx:116 |
| B-471 | /share/recipes/[recipeId] | see a preview card when pasted (OG image) | both | deep link only | app/share/recipes/[recipeId]/opengraph-image.tsx:1 |
| B-472 | /share/* pages | join from a shared page and return to it | both | deep link only | components/share/ShareFrame.tsx:67 |
| B-473 | /share/* pages | sign in from a shared page and return to it | both | deep link only | components/share/ShareFrame.tsx:44 |
| B-474 | /share/* not found | learn a shared page is gone or private, and sign in | both | deep link only | components/share/SharedNotFound.tsx:36 |
| B-475 | /share error boundary | see a shared page failed to load | both | deep link only | app/share/error.tsx:1 |
| B-476 | recipe or item overflow | share a recipe link, or be told why it cannot be shared | both | 2 (recipe › More) | components/recipe/RecipeShare.tsx:55 |
| B-477 | share action, any surface | see "Link copied" when the share sheet is unavailable | desktop | 2 | lib/share/use-share-link.ts:22 |


### Recipes and search

Reach for `/recipes` counts the Cellar tab (1) and its Bar segment (2). Source paths are relative to `services/client/src`.

| id | route or surface | job | device | reach | source |
|---|---|---|---|---|---|
| B-478 | /recipes | open the new-recipe choices | both | 2 | components/recipe/editor/NewRecipeButton.tsx:18 |
| B-479 | /recipes › New recipe sheet › Photo | pick a photo of a recipe card for the AI to read | both | 3 | components/recipe/editor/NewRecipeSheet.tsx:100 |
| B-480 | /recipes › New recipe sheet › Paste | start a recipe from pasted text | both | 3 | components/recipe/editor/NewRecipeSheet.tsx:118 |
| B-481 | /recipes › New recipe sheet › Type | write a recipe in myself | both | 3 | components/recipe/editor/NewRecipeSheet.tsx:136 |
| B-482 | /recipes › Bar card | see what I can make from my bar | both | 2 | components/bar/BarEntryCard.tsx:21 |
| B-483 | /recipes › Your drafts | open an AI-read draft to check it | both | 2 | components/recipe/editor/MyRecipes.tsx:90 |
| B-484 | /recipes › Your recipes | open one of my recipes | both | 2 | components/recipe/editor/MyRecipes.tsx:128 |
| B-485 | /recipes › Your recipes | expand or collapse my full recipe list | both | 2 | components/recipe/editor/MyRecipes.tsx:113 |
| B-486 | /recipes › All recipes | search recipes by a word | both | 2 | components/search/RecipeGroupSearch.tsx:238 |
| B-487 | /recipes › All recipes | clear the search box | both | 2 | components/search/RecipeGroupSearch.tsx:251 |
| B-488 | /recipes › All recipes | filter recipes by category | both | 2 | components/search/RecipeGroupSearch.tsx:273 |
| B-489 | /recipes › All recipes | filter recipes by base spirit | both | 2 | components/search/RecipeGroupSearch.tsx:294 |
| B-490 | /recipes › All recipes | clear category and spirit filters | both | 2 | components/search/RecipeGroupSearch.tsx:312 |
| B-491 | /recipes › All recipes | load the next page of recipes | both | 2 | components/search/RecipeGroupSearch.tsx:361 |
| B-492 | /recipes › All recipes (empty) | clear filters when nothing matches | both | 2 | components/search/RecipeGroupSearch.tsx:374 |
| B-493 | /recipes › All recipes | open a recipe group from its card | both | 3 | components/recipe/RecipeGroupCard.tsx:100 |
| B-494 | /recipes?q= (or ?semantic=) | land on recipes with the search filled in | both | deep link only | app/(authenticated)/recipes/(index)/page.tsx:50 |
| B-495 | /recipes (index) | see why the recipe list failed to load | both | 2 | app/(authenticated)/recipes/(index)/page.tsx:116 |
| B-496 | /recipes/groups/[groupId] | read the community's preferred version of a drink | both | 3 | app/(authenticated)/recipes/groups/[groupId]/page.tsx:59 |
| B-497 | /recipes/groups/[groupId] | open all versions of this drink | both | 3 | app/(authenticated)/recipes/groups/[groupId]/page.tsx:77 |
| B-498 | /recipes/groups/[groupId] | learn nobody has voted, so no community pick | both | 3 | app/(authenticated)/recipes/groups/[groupId]/page.tsx:89 |
| B-499 | /recipes/groups/[groupId]/versions | go back to recipes or the group | both | 4 | app/(authenticated)/recipes/groups/[groupId]/versions/page.tsx:77 |
| B-500 | /recipes/groups/[groupId]/versions | compare each version's ingredients and info | both | 4 | components/recipe/RecipeVersionsTab.tsx:201 |
| B-501 | /recipes/groups/[groupId]/versions | see which version is the community pick | both | 4 | components/recipe/RecipeVersionsTab.tsx:173 |
| B-502 | /recipes/groups/[groupId]/versions | upvote a version | both | 4 | components/recipe/RecipeVoteButtons.tsx:211 |
| B-503 | /recipes/groups/[groupId]/versions | downvote a version | both | 4 | components/recipe/RecipeVoteButtons.tsx:249 |
| B-504 | /recipes/groups/[groupId]/versions | take back my vote by tapping it again | both | 4 | components/recipe/RecipeVoteButtons.tsx:139 |
| B-505 | /recipes/groups/[groupId]/versions | open one version's own page | both | 4 | components/recipe/RecipeVersionsTab.tsx:345 |
| B-506 | /recipes/[recipeId] | read a recipe's ingredients and method | both | 3 | components/recipe/RecipeDetails.tsx:292 |
| B-507 | /recipes/[recipeId] | start Make mode on a saved recipe | both | 3 | components/recipe/RecipeDetails.tsx:239 |
| B-508 | /recipes/[recipeId] | love or unlove a recipe | both | 3 | components/recipe/RecipeLoveButton.tsx:69 |
| B-509 | /recipes/[recipeId] | see I could not save that Love | both | 3 | components/recipe/RecipeLoveButton.tsx:60 |
| B-510 | /recipes/[recipeId] | see whether I can make it from my bar | both | 3 | components/recipe/RecipeDetails.tsx:294 |
| B-511 | /recipes/[recipeId] | jump to the recipe this one varies | both | 3 | components/recipe/RecipeDetails.tsx:253 |
| B-512 | /recipes/[recipeId] | jump to another variation of this recipe | both | 3 | components/recipe/RecipeDetails.tsx:273 |
| B-513 | /recipes/[recipeId] › More | share a recipe link, or learn why not | both | 4 | components/recipe/RecipeShare.tsx:53 |
| B-514 | /recipes/[recipeId] › More (owner) | edit my recipe, or review my draft | both | 4 | components/recipe/RecipeDetails.tsx:157 |
| B-515 | /recipes/[recipeId] › More (owner) | delete my recipe, or discard my draft | both | 4 | components/recipe/RecipeDetails.tsx:164 |
| B-516 | /recipes/[recipeId] › Delete sheet | confirm the delete or discard | both | 4 | components/recipe/RecipeDetails.tsx:379 |
| B-517 | /recipes/[recipeId] › Delete sheet | see why the delete failed | both | 4 | components/recipe/RecipeDetails.tsx:390 |
| B-518 | /recipes/[recipeId] | see "Deleted" and land back on recipes | both | 4 | components/recipe/RecipeDetails.tsx:137 |
| B-519 | /recipes/[recipeId] (my draft) | learn the AI read it and only I see it | both | 3 | components/recipe/RecipeDetails.tsx:174 |
| B-520 | /recipes/[recipeId] (my draft) | open the editor with Review draft | both | 3 | components/recipe/RecipeDetails.tsx:182 |
| B-521 | /recipes/[recipeId] (mine, saved) | see who can see this recipe | both | 3 | components/recipe/RecipeDetails.tsx:405 |
| B-522 | /recipes/[recipeId] (mine, saved) | change who can see it, via Change | both | 3 | components/recipe/RecipeDetails.tsx:417 |
| B-523 | /recipes/[recipeId] › Reviews | write a review with a rating | both | 3 | components/recipe/AddRecipeReview.tsx:213 |
| B-524 | /recipes/[recipeId] › Reviews | save or update my review | both | 3 | components/recipe/AddRecipeReview.tsx:233 |
| B-525 | /recipes/[recipeId] › Reviews | delete my review | both | 3 | components/recipe/AddRecipeReview.tsx:245 |
| B-526 | /recipes/[recipeId] › Reviews | cancel editing my review | both | 3 | components/recipe/AddRecipeReview.tsx:250 |
| B-527 | /recipes/[recipeId] › Reviews | read other people's reviews | both | 3 | components/recipe/RecipeReviews.tsx:124 |
| B-528 | /recipes/[recipeId] › Reviews | load more reviews | both | 3 | components/recipe/RecipeReviews.tsx:128 |
| B-529 | /recipes/new | land in the composer from a link | both | deep link only | components/recipe/editor/RecipeComposer.tsx:113 |
| B-530 | /recipes/new?from=photo | choose a photo of a recipe to read | both | 4 | components/recipe/editor/RecipeComposer.tsx:305 |
| B-531 | /recipes/new?from=paste | paste recipe text and have it read | both | 4 | components/recipe/editor/RecipeComposer.tsx:399 |
| B-532 | /recipes/new?from=type | write a recipe in the editor | both | 4 | components/recipe/editor/RecipeComposer.tsx:127 |
| B-533 | /recipes/new (reading) | watch progress while the AI reads | both | 4 | components/recipe/editor/RecipeComposer.tsx:487 |
| B-534 | /recipes/new (reading) | stop the read | both | 4 | components/recipe/editor/RecipeComposer.tsx:494 |
| B-535 | /recipes/new (stopped or failed) | review the part-read draft | both | 4 | components/recipe/editor/RecipeComposer.tsx:536 |
| B-536 | /recipes/new (failed) | try again or type it instead | both | 4 | components/recipe/editor/RecipeComposer.tsx:578 |
| B-537 | /recipes/new (picked photo) | carry a photo picked in the sheet into the read | both | 4 | components/recipe/editor/pending-photo.ts:1 |
| B-538 | /recipes/ai-generator | follow an old link on to the photo composer | both | deep link only | app/(authenticated)/recipes/ai-generator/page.tsx:9 |
| B-539 | /recipes/[recipeId]/edit | check an AI draft, then save it | both | 4 | components/recipe/editor/RecipeEditor.tsx:283 |
| B-540 | /recipes/[recipeId]/edit | edit the name and notes | both | 4 | components/recipe/editor/RecipeEditor.tsx:308 |
| B-541 | /recipes/[recipeId]/edit | keep every AI-matched ingredient at once | both | 4 | components/recipe/editor/RecipeEditor.tsx:340 |
| B-542 | /recipes/[recipeId]/edit | keep one AI-matched catalog item | both | 4 | components/recipe/editor/RecipeEditor.tsx:613 |
| B-543 | /recipes/[recipeId]/edit | reject a match with Not this, or unlink it | both | 4 | components/recipe/editor/RecipeEditor.tsx:631 |
| B-544 | /recipes/[recipeId]/edit | add an ingredient line | both | 4 | components/recipe/editor/RecipeEditor.tsx:377 |
| B-545 | /recipes/[recipeId]/edit | set an amount and name for an ingredient | both | 4 | components/recipe/editor/RecipeEditor.tsx:557 |
| B-546 | /recipes/[recipeId]/edit | remove an ingredient line | both | 4 | components/recipe/editor/RecipeEditor.tsx:583 |
| B-547 | /recipes/[recipeId]/edit | add a method step | both | 4 | components/recipe/editor/RecipeEditor.tsx:445 |
| B-548 | /recipes/[recipeId]/edit | remove a method step | both | 4 | components/recipe/editor/RecipeEditor.tsx:417 |
| B-549 | /recipes/[recipeId]/edit | choose Private, Friends or Public | both | 4 | components/recipe/editor/RecipeEditor.tsx:467 |
| B-550 | /recipes/[recipeId]/edit | save the recipe or my changes | both | 4 | components/recipe/editor/RecipeEditor.tsx:506 |
| B-551 | /recipes/[recipeId]/edit | see which save step failed | both | 4 | components/recipe/editor/RecipeEditor.tsx:493 |
| B-552 | /recipes/[recipeId]/edit | see "Saved. Only you can see it." | both | 4 | components/recipe/editor/RecipeEditor.tsx:224 |
| B-553 | /recipes/[recipeId]/edit › More | discard the draft or delete the recipe | both | 5 | components/recipe/editor/RecipeEditor.tsx:271 |
| B-554 | /recipes/[recipeId]/edit › Delete sheet | confirm the discard or delete | both | 5 | components/recipe/editor/RecipeEditor.tsx:514 |
| B-555 | /recipes/[recipeId]/edit › Delete sheet | see why the delete failed | both | 5 | components/recipe/editor/RecipeEditor.tsx:528 |
| B-556 | /recipes/[recipeId]/edit | see "Draft discarded" or "Recipe deleted" | both | 5 | components/recipe/editor/RecipeEditor.tsx:257 |
| B-557 | /recipes/[recipeId]/make | follow the recipe one step at a time | phone | 4 | components/make/MakeMode.tsx:210 |
| B-558 | /recipes/[recipeId]/make | see which step I am on | phone | 4 | components/make/MakeMode.tsx:196 |
| B-559 | /recipes/[recipeId]/make | make fewer servings | phone | 4 | components/make/MakeMode.tsx:172 |
| B-560 | /recipes/[recipeId]/make | make more servings | phone | 4 | components/make/MakeMode.tsx:184 |
| B-561 | /recipes/[recipeId]/make | start or stop a step's timer | phone | 4 | components/make/MakeMode.tsx:316 |
| B-562 | /recipes/[recipeId]/make | tick off each ingredient as I use it | phone | 4 | components/make/MakeMode.tsx:254 |
| B-563 | /recipes/[recipeId]/make | keep the screen on while I make it | phone | 4 | components/make/MakeMode.tsx:165 |
| B-564 | /recipes/[recipeId]/make | go back a step | phone | 4 | components/make/MakeMode.tsx:284 |
| B-565 | /recipes/[recipeId]/make | go to the next step, or finish with Made it | phone | 4 | components/make/MakeMode.tsx:294 |
| B-566 | /recipes/[recipeId]/make | learn the recipe has no steps, only ingredients | phone | 4 | components/make/MakeMode.tsx:210 |
| B-567 | /recipes/[recipeId]/make | leave Make mode to where I came from | phone | 4 | components/make/MakeMode.tsx:156 |
| B-568 | Make mode › Made it toast | undo the drink log | phone | 4 | components/make/MakeMode.tsx:93 |
| B-569 | Make mode › Made it toast | see the undo failed | phone | 4 | components/make/MakeMode.tsx:100 |
| B-570 | Make mode › Made it screen | rate the drink I just made | phone | 4 | components/make/MakeMode.tsx:123 |
| B-571 | Make mode › Made it screen | return to the recipe | phone | 4 | components/make/MakeMode.tsx:141 |
| B-572 | /recipes/bar | see drinks I can make now | both | 3 | components/bar/WhatCanIMake.tsx:121 |
| B-573 | /recipes/bar | see drinks one bottle away | both | 3 | components/bar/WhatCanIMake.tsx:124 |
| B-574 | /recipes/bar | see which bottles to pick up next | both | 3 | components/bar/WhatCanIMake.tsx:130 |
| B-575 | /recipes/bar | open a drink I can make | both | 4 | components/bar/BarRecipeRow.tsx:46 |
| B-576 | /recipes/bar (empty) | learn my bar is empty, and open the pantry | both | 3 | components/bar/WhatCanIMake.tsx:92 |
| B-577 | /recipes/bar | open the pantry to tick what I have | both | 4 | components/bar/WhatCanIMake.tsx:108 |
| B-578 | /recipes/bar › More | open the Bar pantry | both | 4 | components/bar/BarAppBar.tsx:19 |
| B-579 | /recipes/bar (nothing yet) | learn nothing is makeable yet | both | 3 | components/bar/WhatCanIMake.tsx:148 |
| B-580 | /recipes/bar/pantry | tick or untick a pantry staple | both | 4 | components/bar/PantryEditor.tsx:104 |
| B-581 | /recipes/bar/pantry | see a pantry toggle failed to save | both | 4 | components/bar/PantryEditor.tsx:69 |
| B-582 | /recipes/[recipeId] | see "Your bar" and what I am missing | both | 3 | components/bar/Availability.tsx:93 |
| B-583 | /recipes/[recipeId] | open my bar from the makeability line | both | 3 | components/bar/Availability.tsx:89 |
| B-584 | item page › Cocktails with this | see cocktails that use this bottle | both | 3 | components/bar/ItemCocktails.tsx:51 |
| B-585 | item page › Use it up | see cocktails to finish an open bottle | both | 3 | components/bar/ItemCocktails.tsx:19 |
| B-586 | item page › Cocktails with this | open the bar from that section | both | 3 | components/bar/ItemCocktails.tsx:54 |
| B-587 | item page (tea, coffee) › Brew guide | read typical steep or brew numbers | both | 3 | components/item/BrewGuideSection.tsx:83 |
| B-588 | item page › Brew guide | start the first steep or brew timer | both | 3 | components/item/BrewGuideSection.tsx:184 |
| B-589 | item page › Brew guide | add my own brew numbers | both | 3 | components/item/BrewGuideSection.tsx:91 |
| B-590 | item page › Brew guide | set water temp, time, dose and water | both | 3 | components/item/BrewGuideSection.tsx:62 |
| B-591 | item page › Brew guide | save my numbers or cancel | both | 3 | components/item/BrewGuideSection.tsx:285 |
| B-592 | item page › Brew guide | clear my numbers and go back to typical | both | 3 | components/item/BrewGuideSection.tsx:293 |
| B-593 | /search | type to search everything I can see | both | 0 | components/search/ClientSearchInterface.tsx:256 |
| B-594 | /search | clear the search box | both | 0 | components/search/ClientSearchInterface.tsx:277 |
| B-595 | /search | scan a barcode for a bottle | phone | 1 | components/search/ClientSearchInterface.tsx:291 |
| B-596 | /search › Scan sheet | cancel the scan and search by name | phone | 1 | components/search/ClientSearchInterface.tsx:367 |
| B-597 | /search | photograph a label or item to search | phone | 1 | components/search/ClientSearchInterface.tsx:300 |
| B-598 | /search › Camera sheet | cancel the camera | phone | 1 | components/search/ClientSearchInterface.tsx:427 |
| B-599 | /search | scan a barcode (button on desktop) | desktop | 1 | components/search/ClientSearchInterface.tsx:317 |
| B-600 | /search | search by photo (button on desktop) | desktop | 1 | components/search/ClientSearchInterface.tsx:327 |
| B-601 | /search (no query) | read the hint on what search covers | both | 0 | components/search/SearchSheetHeader.tsx:41 |
| B-602 | /search | close search and go back where I was | both | 0 | components/search/SearchSheetHeader.tsx:33 |
| B-603 | /search | see Your bottles, Items, Places, Recipes, People, Brands | both | 1 | components/search/universal-search.ts:37 |
| B-604 | /search › a section | open one of its first three rows | both | 2 | components/search/SearchSections.tsx:115 |
| B-605 | /search › a section | open the full list with See all | both | 2 | components/search/SearchSections.tsx:148 |
| B-606 | /search?in= (See all) | go back to all results | both | 2 | components/search/SearchSections.tsx:185 |
| B-607 | /search › People | send a friend request from a result | both | 2 | components/search/AddFriendButton.tsx:107 |
| B-608 | /search › People | see the request sent or failed | both | 2 | components/search/AddFriendButton.tsx:92 |
| B-609 | /search › People | open a friend's profile, or Friends for a pending one | both | 2 | components/search/universal-search.ts:509 |
| B-610 | /search › Recipes | open a recipe, or its group, from results | both | 2 | components/search/universal-search.ts:469 |
| B-611 | /search › Places | open a place from results | both | 2 | components/search/universal-search.ts:420 |
| B-612 | /search › Brands | open a brand from results | both | 2 | components/search/universal-search.ts:531 |
| B-613 | /search (nothing found) | add an item that is not in the catalog | both | 1 | components/search/SearchSections.tsx:271 |
| B-614 | /search (search down) | try the search again | both | 1 | components/search/RetrySearchButton.tsx:21 |
| B-615 | /search?barcode= | see items that match a scanned code | both | 1 | components/search/ServerBarcodeResults.tsx:37 |
| B-616 | /search?barcode= (none) | add an item when no barcode matches | both | 1 | components/search/NoSearchResults.tsx:21 |
| B-617 | /search?barcode= (failed) | learn the barcode search failed | both | 1 | components/search/ServerBarcodeResults.tsx:33 |
| B-618 | /search?image= | see items that match a photo | both | 1 | components/search/ServerImageResults.tsx:90 |
| B-619 | /search?image= | read the photo as a label in Add instead | both | 1 | components/search/ReadLabelInstead.tsx:53 |
| B-620 | /search?image= (expired) | learn the photo link has expired | both | deep link only | components/search/ServerImageResults.tsx:27 |
| B-621 | /search?q= | arrive with a term already searched | both | deep link only | app/(authenticated)/search/page.tsx:50 |
| B-622 | /brands | browse brands in a grid | both | ORPHAN | app/(authenticated)/brands/page.tsx:49 |
| B-623 | /brands?q= | arrive at brands with a term filled in | both | 2 (search › Brands › See all) | components/search/universal-search.ts:92 |
| B-624 | /brands | search brands by name | both | ORPHAN | components/brand/BrandsListClient.tsx:127 |
| B-625 | /brands | open a brand from its card | both | ORPHAN | components/brand/BrandsListClient.tsx:156 |
| B-626 | /brands | load more brands | both | ORPHAN | components/brand/BrandsListClient.tsx:147 |
| B-627 | /brands (empty) | learn no brands match | both | ORPHAN | components/brand/BrandsListClient.tsx:146 |
| B-628 | /brands/[brandId] | read a brand's description | both | 3 (item page › brand) | components/brand/BrandDetails.tsx:205 |
| B-629 | /brands/[brandId] | open the brand that owns this one | both | 3 | components/brand/BrandDetails.tsx:220 |
| B-630 | /brands/[brandId] | open a brand this one owns | both | 3 | components/brand/BrandDetails.tsx:236 |
| B-631 | /brands/[brandId] | open an item sold under this brand | both | 3 | components/brand/BrandDetails.tsx:277 |
| B-632 | /brands/[brandId] | show more of this brand's items | both | 3 | components/brand/BrandDetailsClient.tsx:161 |
| B-633 | /brands/[brandId] | show more sub-brands | both | 3 | components/brand/BrandDetailsClient.tsx:168 |
| B-634 | /brands/[brandId] | open a place that carries this brand | both | 3 | components/brand/BrandDetails.tsx:317 |
| B-635 | /brands/[brandId] | show more places | both | 3 | components/brand/BrandDetailsClient.tsx:175 |
| B-636 | /brands/[brandId] (empty) | learn no items or places carry it | both | 3 | components/brand/BrandDetails.tsx:260 |
| B-637 | item page › brand | open the producer brand from an item | both | 2 | components/item/ItemHero.tsx:55 |
| B-638 | item page › brands | open the primary or another brand | both | 2 | components/item/ItemBrands.tsx:122 |
| B-639 | add or edit item › Brand | search or type a brand to attach | both | 3 | components/brand/BrandPicker.tsx:178 |
| B-640 | add or edit item › Brand | clear the chosen brand | both | 3 | components/brand/BrandPicker.tsx:195 |
| B-641 | add or edit item › Brand | pick a brand from the list | both | 3 | components/brand/BrandPicker.tsx:243 |
| B-642 | item page › Change brand | change which brand an item has | both | 3 | components/item/ChangeBrand.tsx:130 |
| B-643 | /favorites (Loved) › recipe row | love or unlove a recipe from my Loved list | both | 2 | components/favorites/LovedRecipes.tsx:111 |

### Notes (branch, last two areas)

### Counts
- Area 1, Social, recap, taste and tier lists: 147 jobs (B-331 to B-477).
- Area 2, Recipes and search: 166 jobs (B-478 to B-643).
- Orphans in my two areas: 5 (B-622, B-624, B-625, B-626, B-627, the `/brands` index). `/brands` has no nav entry; `components/app/nav.ts:74` lists it only as a route that keeps Me lit. The only route in is search › Brands › See all (`/brands?q=`), so it cannot be opened with no term. That is why I call it an orphan as an index.
- Deep link only: B-494, B-529, B-538, B-620, B-621 (plus B-351, B-474, B-475 in area 1).

### Redirect-only routes
- `/users` goes to `/me` (`app/(authenticated)/users/page.tsx:9`).
- `/users/[userId]` with my own id goes to `/me` (same file, line 41).
- `/recipes/ai-generator` goes to `/recipes/new?from=photo` (`app/(authenticated)/recipes/ai-generator/page.tsx:9`).
- `/share/items/...` and `/share/tier-lists/...` send a signed-in viewer to the canonical page.
- `/recipes?semantic=` is an old alias of `?q=` (`recipes/(index)/page.tsx:50`).
- `/recipes/groups/[groupId]` is not a redirect but renders the group's canonical (or first) recipe by `RecipePage`, with a header on top (`groups/[groupId]/page.tsx:59`). So B-496 and B-506 share one body.

### Dead code that looks like a job
- `components/recipe/RecipeGroupCard.tsx` also takes an `onClick(groupId)` prop. The only render site, `RecipeGroupSearch.tsx:345`, passes `href`, so the prop path is unused by the app (callers of `onRecipeGroupSelect` not found, unconfirmed).
- `components/recipe/RecipeVersionsTab.tsx` carries a vote-state callback `onVoted({canonicalChanged})`. It is used; listed here only because the page shows "Showing the top version" until a vote lands.
- `components/search/NearbyPlaces.tsx` lives in the search folder but renders only on Home (`components/home/NearbySection.tsx:60`). It is in Area 0 as B-059 to B-061, so I did not repeat it.
- `components/search/Greeting.tsx` is a greeting line, not a job.
- `AddToTierListButton` (Area 1, B-460 to B-463): I found no import outside its own file. Treat as dead until the lead checks.

### Facts to rule on
- The Bar segment of `/recipes` is a 2-tap reach from the tab bar by my counting (Cellar tab, then Bar segment). If the Cellar tab opens on the Bar, make it 1.
- `/brands` index is an orphan. Either add an entry, or accept it as search's "See all".
- `MakeMode` is built for a phone (wake lock, big step view). Nothing blocks it on a desktop, so I marked it `phone` by intent, not by enforcement.
- Steep and Brew are not Make mode. They are the Brew guide on a tea or coffee item page (`components/item/BrewGuideSection.tsx`), not on `/recipes/[id]/make`. `docs/product/decisions.md:900` groups them under one wave.

### Not verified
- No QR-code feature exists anywhere in the client; a grep for `qrcode` and `QR` found nothing.
- Area 1: I did not read `app/invite/[token]/not-found.tsx`, `app/share/error.tsx` (B-351, B-475 rest on the file existing), or the `/recap/api` route internals (B-380). The Insights AI sections (Hot Take, Palate Profile, Blind Spots) were read by grep only.
- Area 2 line numbers were taken from grep hits for most rows. Rows where I read nearby text rather than the exact line: B-495, B-499, B-501, B-505, B-537, B-557, B-558, B-566, B-598, B-600, B-603, B-609, B-639 to B-641. Re-open them if one is quoted.
- I did not read `decisions.md` at lines 269 (Search) or 385 (Recipes) in full. I read only the Make mode block at 900, and checked its claims against `MakeMode.tsx`.
- Whether the Make-mode "Leave" asks for confirmation: `leave.ts` only restores where I came from, and no sheet appeared in `MakeMode.tsx`; I did not run it.
- Device split for `/search` scan and photo buttons (B-595 to B-600) comes from the code branching, not a run. Where the camera is absent, the buttons are untested.
- Nothing here was run in a browser, so `reach` counts come from the code and `nav.ts`, not clicks.

### Checklist
- [x] /recipes index, My recipes, drafts, New recipe sheet
- [x] Recipe group page and versions
- [x] A recipe: love, reviews, privacy, share, delete
- [x] /recipes/new and the composer (photo, paste, type)
- [x] /recipes/[recipeId]/edit
- [x] /recipes/ai-generator (redirect)
- [x] /recipes/[recipeId]/make, Made it
- [x] Steep and Brew (on the item page)
- [x] /recipes/bar and /recipes/bar/pantry
- [x] /search, sections, barcode, image, retry, add friend
- [x] /brands and /brands/[brandId]
- [ ] decisions.md lines 269 and 385 read in full (not covered)
- [ ] browser check of any reach count (not covered)
- Covered 11 of 13.
