import { defineRelations } from "drizzle-orm";
import * as schema from "./tables.ts";

export const relations = defineRelations(schema, (r) => ({
	account: {
		user: r.one.user({
			from: r.account.userId,
			to: r.user.id
		}),
	},
	user: {
		accounts: r.many.account(),
		beers: r.many.beers(),
		cellarItemsCreatedBy: r.many.cellarItems({
			alias: "cellarItems_createdBy_user_id"
		}),
		cellarsViaCellarOwners: r.many.cellars({
			alias: "cellars_id_user_id_via_cellarOwners"
		}),
		cellarsCreatedById: r.many.cellars({
			alias: "cellars_createdById_user_id"
		}),
		coffees: r.many.coffees(),
		genericItems: r.many.genericItems(),
		itemFavorites: r.many.itemFavorites(),
		itemImages: r.many.itemImage(),
		itemMatchSuggestions: r.many.itemMatchSuggestions(),
		itemOnboardings: r.many.itemOnboardings(),
		itemReviews: r.many.itemReviews(),
		menuScans: r.many.menuScans(),
		placeMenuItems: r.many.placeMenuItems(),
		placeMenusCreatedBy: r.many.placeMenus({
			alias: "placeMenus_createdBy_user_id"
		}),
		placeMenusVerifiedBy: r.many.placeMenus({
			alias: "placeMenus_verifiedBy_user_id"
		}),
		placesCreatedBy: r.many.places({
			alias: "places_createdBy_user_id"
		}),
		recipesViaRecipeReviews: r.many.recipes({
			alias: "recipes_id_user_id_via_recipeReviews"
		}),
		recipesViaRecipeVotes: r.many.recipes({
			alias: "recipes_id_user_id_via_recipeVotes"
		}),
		recipesCreatedById: r.many.recipes({
			alias: "recipes_createdById_user_id"
		}),
		sakes: r.many.sakes(),
		sessions: r.many.session(),
		spirits: r.many.spirits(),
		teas: r.many.teas(),
		tierLists: r.many.tierLists(),
		placesViaUserPlaceInteractions: r.many.places({
			alias: "places_id_user_id_via_userPlaceInteractions"
		}),
		wines: r.many.wines(),
		cellarOwners: r.many.cellarOwners(),
		checkIns: r.many.checkIns(),
		friendRequestsFriendId: r.many.friendRequests({
			alias: "friendRequests_friendId_user_id"
		}),
		friendRequestsUserId: r.many.friendRequests({
			alias: "friendRequests_userId_user_id"
		}),
		friendsFriendId: r.many.friends({
			alias: "friends_friendId_user_id"
		}),
		friendsUserId: r.many.friends({
			alias: "friends_userId_user_id"
		}),
		recipeGroups: r.many.recipeGroups(),
		recipeReviews: r.many.recipeReviews(),
		recipeVotes: r.many.recipeVotes(),
		userPlaceInteractions: r.many.userPlaceInteractions(),
	},
	beers: {
		barcode: r.one.barcodes({
			from: r.beers.barcodeCode,
			to: r.barcodes.code
		}),
		countryRelation: r.one.country({
			from: r.beers.country,
			to: r.country.value
		}),
		user: r.one.user({
			from: r.beers.createdById,
			to: r.user.id
		}),
		itemOnboarding: r.one.itemOnboardings({
			from: r.beers.itemOnboardingId,
			to: r.itemOnboardings.id
		}),
		beerStyle: r.one.beerStyle({
			from: r.beers.style,
			to: r.beerStyle.value
		}),
		cellarItems: r.many.cellarItems(),
		itemBrands: r.many.itemBrands(),
		itemFavorites: r.many.itemFavorites(),
		itemImages: r.many.itemImage(),
		itemMatchSuggestions: r.many.itemMatchSuggestions(),
		itemReviews: r.many.itemReviews(),
		itemVectors: r.many.itemVectors(),
		placeMenuItems: r.many.placeMenuItems(),
		recipeIngredients: r.many.recipeIngredients(),
		tierListItems: r.many.tierListItems(),
	},
	barcodes: {
		beers: r.many.beers(),
		coffees: r.many.coffees(),
		sakes: r.many.sakes(),
		spirits: r.many.spirits(),
		teas: r.many.teas(),
		wines: r.many.wines(),
	},
	country: {
		beers: r.many.beers(),
		coffees: r.many.coffees(),
		sakes: r.many.sakes(),
		spirits: r.many.spirits(),
		wines: r.many.wines(),
	},
	itemOnboardings: {
		beers: r.many.beers(),
		coffees: r.many.coffees(),
		fileBackLabelImageId: r.one.files({
			from: r.itemOnboardings.backLabelImageId,
			to: r.files.id,
			alias: "itemOnboardings_backLabelImageId_files_id"
		}),
		fileFrontLabelImageId: r.one.files({
			from: r.itemOnboardings.frontLabelImageId,
			to: r.files.id,
			alias: "itemOnboardings_frontLabelImageId_files_id"
		}),
		user: r.one.user({
			from: r.itemOnboardings.userId,
			to: r.user.id
		}),
		spirits: r.many.spirits(),
		wines: r.many.wines(),
	},
	beerStyle: {
		beers: r.many.beers(),
	},
	brands: {
		brand: r.one.brands({
			from: r.brands.parentBrandId,
			to: r.brands.id,
			alias: "brands_parentBrandId_brands_id"
		}),
		brands: r.many.brands({
			alias: "brands_parentBrandId_brands_id"
		}),
		itemBrands: r.many.itemBrands(),
		places: r.many.places({
			from: r.brands.id.through(r.placeBrands.brandId),
			to: r.places.id.through(r.placeBrands.placeId)
		}),
		placeBrands: r.many.placeBrands(),
	},
	cellarItems: {
		beer: r.one.beers({
			from: r.cellarItems.beerId,
			to: r.beers.id
		}),
		cellar: r.one.cellars({
			from: r.cellarItems.cellarId,
			to: r.cellars.id
		}),
		coffee: r.one.coffees({
			from: r.cellarItems.coffeeId,
			to: r.coffees.id
		}),
		user: r.one.user({
			from: r.cellarItems.createdBy,
			to: r.user.id,
			alias: "cellarItems_createdBy_user_id"
		}),
		itemImage: r.one.itemImage({
			from: r.cellarItems.displayImageId,
			to: r.itemImage.id
		}),
		sake: r.one.sakes({
			from: r.cellarItems.sakeId,
			to: r.sakes.id
		}),
		placeMenuItem: r.one.placeMenuItems({
			from: r.cellarItems.sourceMenuItemId,
			to: r.placeMenuItems.id
		}),
		place: r.one.places({
			from: r.cellarItems.sourcePlaceId,
			to: r.places.id
		}),
		spirit: r.one.spirits({
			from: r.cellarItems.spiritId,
			to: r.spirits.id
		}),
		tea: r.one.teas({
			from: r.cellarItems.teaId,
			to: r.teas.id
		}),
		wine: r.one.wines({
			from: r.cellarItems.wineId,
			to: r.wines.id
		}),
		checkIns: r.many.checkIns(),
	},
	cellars: {
		cellarItems: r.many.cellarItems(),
		cellarOwners: r.many.cellarOwners(),
		users: r.many.user({
			from: r.cellars.id.through(r.cellarOwners.cellarId),
			to: r.user.id.through(r.cellarOwners.userId),
			alias: "cellars_id_user_id_via_cellarOwners"
		}),
		user: r.one.user({
			from: r.cellars.createdById,
			to: r.user.id,
			alias: "cellars_createdById_user_id"
		}),
	},
	coffees: {
		cellarItems: r.many.cellarItems(),
		barcode: r.one.barcodes({
			from: r.coffees.barcodeCode,
			to: r.barcodes.code
		}),
		countryRelation: r.one.country({
			from: r.coffees.country,
			to: r.country.value
		}),
		user: r.one.user({
			from: r.coffees.createdById,
			to: r.user.id
		}),
		coffeeCultivar: r.one.coffeeCultivar({
			from: r.coffees.cultivar,
			to: r.coffeeCultivar.value
		}),
		itemOnboarding: r.one.itemOnboardings({
			from: r.coffees.itemOnboardingId,
			to: r.itemOnboardings.id
		}),
		itemBrands: r.many.itemBrands(),
		itemFavorites: r.many.itemFavorites(),
		itemImages: r.many.itemImage(),
		itemMatchSuggestions: r.many.itemMatchSuggestions(),
		itemReviews: r.many.itemReviews(),
		itemVectors: r.many.itemVectors(),
		placeMenuItems: r.many.placeMenuItems(),
		recipeIngredients: r.many.recipeIngredients(),
		tierListItems: r.many.tierListItems(),
	},
	itemImage: {
		cellarItems: r.many.cellarItems(),
		beer: r.one.beers({
			from: r.itemImage.beerId,
			to: r.beers.id
		}),
		coffee: r.one.coffees({
			from: r.itemImage.coffeeId,
			to: r.coffees.id
		}),
		file: r.one.files({
			from: r.itemImage.fileId,
			to: r.files.id
		}),
		sake: r.one.sakes({
			from: r.itemImage.sakeId,
			to: r.sakes.id
		}),
		spirit: r.one.spirits({
			from: r.itemImage.spiritId,
			to: r.spirits.id
		}),
		tea: r.one.teas({
			from: r.itemImage.teaId,
			to: r.teas.id
		}),
		user: r.one.user({
			from: r.itemImage.userId,
			to: r.user.id
		}),
		wine: r.one.wines({
			from: r.itemImage.wineId,
			to: r.wines.id
		}),
	},
	sakes: {
		cellarItems: r.many.cellarItems(),
		itemBrands: r.many.itemBrands(),
		itemFavorites: r.many.itemFavorites(),
		itemImages: r.many.itemImage(),
		itemMatchSuggestions: r.many.itemMatchSuggestions(),
		itemReviews: r.many.itemReviews(),
		itemVectors: r.many.itemVectors(),
		recipeIngredients: r.many.recipeIngredients(),
		barcode: r.one.barcodes({
			from: r.sakes.barcodeCode,
			to: r.barcodes.code
		}),
		sakeCategory: r.one.sakeCategory({
			from: r.sakes.category,
			to: r.sakeCategory.value
		}),
		countryRelation: r.one.country({
			from: r.sakes.country,
			to: r.country.value
		}),
		user: r.one.user({
			from: r.sakes.createdById,
			to: r.user.id
		}),
		sakeRiceVariety: r.one.sakeRiceVariety({
			from: r.sakes.riceVariety,
			to: r.sakeRiceVariety.value
		}),
		sakeType: r.one.sakeType({
			from: r.sakes.type,
			to: r.sakeType.value
		}),
		tierListItems: r.many.tierListItems(),
	},
	placeMenuItems: {
		cellarItems: r.many.cellarItems(),
		itemMatchSuggestions: r.many.itemMatchSuggestions(),
		recipes: r.many.recipes({
			from: r.placeMenuItems.id.through(r.menuItemRecipes.menuItemId),
			to: r.recipes.id.through(r.menuItemRecipes.recipeId)
		}),
		menuItemRecipes: r.many.menuItemRecipes(),
		beer: r.one.beers({
			from: r.placeMenuItems.beerId,
			to: r.beers.id
		}),
		coffee: r.one.coffees({
			from: r.placeMenuItems.coffeeId,
			to: r.coffees.id
		}),
		user: r.one.user({
			from: r.placeMenuItems.matchVerifiedBy,
			to: r.user.id
		}),
		menuScan: r.one.menuScans({
			from: r.placeMenuItems.menuScanId,
			to: r.menuScans.id
		}),
		place: r.one.places({
			from: r.placeMenuItems.placeId,
			to: r.places.id
		}),
		placeMenu: r.one.placeMenus({
			from: r.placeMenuItems.placeMenuId,
			to: r.placeMenus.id
		}),
		spirit: r.one.spirits({
			from: r.placeMenuItems.spiritId,
			to: r.spirits.id
		}),
		wine: r.one.wines({
			from: r.placeMenuItems.wineId,
			to: r.wines.id
		}),
	},
	places: {
		cellarItems: r.many.cellarItems(),
		menuScansEstimatedPlaceId: r.many.menuScans({
			alias: "menuScans_estimatedPlaceId_places_id"
		}),
		menuScansManualPlaceOverride: r.many.menuScans({
			alias: "menuScans_manualPlaceOverride_places_id"
		}),
		menuScansPlaceId: r.many.menuScans({
			alias: "menuScans_placeId_places_id"
		}),
		brands: r.many.brands(),
		placeGoogleEnrichments: r.many.placeGoogleEnrichments(),
		placeBrands: r.many.placeBrands(),
		placeGooglePhotos: r.many.placeGooglePhotos(),
		placeMenuItems: r.many.placeMenuItems(),
		placeMenus: r.many.placeMenus(),
		placeVectors: r.many.placeVectors(),
		user: r.one.user({
			from: r.places.createdBy,
			to: r.user.id,
			alias: "places_createdBy_user_id"
		}),
		tierListItems: r.many.tierListItems(),
		users: r.many.user({
			from: r.places.id.through(r.userPlaceInteractions.placeId),
			to: r.user.id.through(r.userPlaceInteractions.userId),
			alias: "places_id_user_id_via_userPlaceInteractions"
		}),
		userPlaceInteractions: r.many.userPlaceInteractions(),
	},
	spirits: {
		cellarItems: r.many.cellarItems(),
		itemBrands: r.many.itemBrands(),
		itemFavorites: r.many.itemFavorites(),
		itemImages: r.many.itemImage(),
		itemMatchSuggestions: r.many.itemMatchSuggestions(),
		itemReviews: r.many.itemReviews(),
		itemVectors: r.many.itemVectors(),
		placeMenuItems: r.many.placeMenuItems(),
		recipeIngredients: r.many.recipeIngredients(),
		barcode: r.one.barcodes({
			from: r.spirits.barcodeCode,
			to: r.barcodes.code
		}),
		countryRelation: r.one.country({
			from: r.spirits.country,
			to: r.country.value
		}),
		user: r.one.user({
			from: r.spirits.createdById,
			to: r.user.id
		}),
		itemOnboarding: r.one.itemOnboardings({
			from: r.spirits.itemOnboardingId,
			to: r.itemOnboardings.id
		}),
		spiritType: r.one.spiritType({
			from: r.spirits.type,
			to: r.spiritType.value
		}),
		tierListItems: r.many.tierListItems(),
	},
	teas: {
		cellarItems: r.many.cellarItems(),
		itemBrands: r.many.itemBrands(),
		itemFavorites: r.many.itemFavorites(),
		itemImages: r.many.itemImage(),
		itemMatchSuggestions: r.many.itemMatchSuggestions(),
		itemReviews: r.many.itemReviews(),
		itemVectors: r.many.itemVectors(),
		recipeIngredients: r.many.recipeIngredients(),
		barcode: r.one.barcodes({
			from: r.teas.barcodeCode,
			to: r.barcodes.code
		}),
		teaCategory: r.one.teaCategory({
			from: r.teas.category,
			to: r.teaCategory.value
		}),
		user: r.one.user({
			from: r.teas.createdById,
			to: r.user.id
		}),
		tierListItems: r.many.tierListItems(),
	},
	wines: {
		cellarItems: r.many.cellarItems(),
		itemBrands: r.many.itemBrands(),
		itemFavorites: r.many.itemFavorites(),
		itemImages: r.many.itemImage(),
		itemMatchSuggestions: r.many.itemMatchSuggestions(),
		itemReviews: r.many.itemReviews(),
		itemVectors: r.many.itemVectors(),
		placeMenuItems: r.many.placeMenuItems(),
		recipeIngredients: r.many.recipeIngredients(),
		tierListItems: r.many.tierListItems(),
		barcode: r.one.barcodes({
			from: r.wines.barcodeCode,
			to: r.barcodes.code
		}),
		countryRelation: r.one.country({
			from: r.wines.country,
			to: r.country.value
		}),
		user: r.one.user({
			from: r.wines.createdById,
			to: r.user.id
		}),
		itemOnboarding: r.one.itemOnboardings({
			from: r.wines.itemOnboardingId,
			to: r.itemOnboardings.id
		}),
		wineStyle: r.one.wineStyle({
			from: r.wines.style,
			to: r.wineStyle.value
		}),
		wineVariety: r.one.wineVariety({
			from: r.wines.variety,
			to: r.wineVariety.value
		}),
	},
	coffeeCultivar: {
		coffees: r.many.coffees(),
	},
	genericItems: {
		user: r.one.user({
			from: r.genericItems.createdById,
			to: r.user.id
		}),
		recipeIngredients: r.many.recipeIngredients(),
	},
	itemBrands: {
		beer: r.one.beers({
			from: r.itemBrands.beerId,
			to: r.beers.id
		}),
		brand: r.one.brands({
			from: r.itemBrands.brandId,
			to: r.brands.id
		}),
		coffee: r.one.coffees({
			from: r.itemBrands.coffeeId,
			to: r.coffees.id
		}),
		sake: r.one.sakes({
			from: r.itemBrands.sakeId,
			to: r.sakes.id
		}),
		spirit: r.one.spirits({
			from: r.itemBrands.spiritId,
			to: r.spirits.id
		}),
		tea: r.one.teas({
			from: r.itemBrands.teaId,
			to: r.teas.id
		}),
		wine: r.one.wines({
			from: r.itemBrands.wineId,
			to: r.wines.id
		}),
	},
	itemFavorites: {
		beer: r.one.beers({
			from: r.itemFavorites.beerId,
			to: r.beers.id
		}),
		coffee: r.one.coffees({
			from: r.itemFavorites.coffeeId,
			to: r.coffees.id
		}),
		sake: r.one.sakes({
			from: r.itemFavorites.sakeId,
			to: r.sakes.id
		}),
		spirit: r.one.spirits({
			from: r.itemFavorites.spiritId,
			to: r.spirits.id
		}),
		tea: r.one.teas({
			from: r.itemFavorites.teaId,
			to: r.teas.id
		}),
		user: r.one.user({
			from: r.itemFavorites.userId,
			to: r.user.id
		}),
		wine: r.one.wines({
			from: r.itemFavorites.wineId,
			to: r.wines.id
		}),
	},
	files: {
		itemImages: r.many.itemImage(),
		itemOnboardingsBackLabelImageId: r.many.itemOnboardings({
			alias: "itemOnboardings_backLabelImageId_files_id"
		}),
		itemOnboardingsFrontLabelImageId: r.many.itemOnboardings({
			alias: "itemOnboardings_frontLabelImageId_files_id"
		}),
		menuScansOriginalImageId: r.many.menuScans({
			alias: "menuScans_originalImageId_files_id"
		}),
		menuScansProcessedImageId: r.many.menuScans({
			alias: "menuScans_processedImageId_files_id"
		}),
		placeGooglePhotos: r.many.placeGooglePhotos(),
	},
	itemMatchSuggestions: {
		user: r.one.user({
			from: r.itemMatchSuggestions.actedBy,
			to: r.user.id
		}),
		placeMenuItem: r.one.placeMenuItems({
			from: r.itemMatchSuggestions.placeMenuItemId,
			to: r.placeMenuItems.id
		}),
		beer: r.one.beers({
			from: r.itemMatchSuggestions.suggestedBeerId,
			to: r.beers.id
		}),
		coffee: r.one.coffees({
			from: r.itemMatchSuggestions.suggestedCoffeeId,
			to: r.coffees.id
		}),
		recipe: r.one.recipes({
			from: r.itemMatchSuggestions.suggestedRecipeId,
			to: r.recipes.id
		}),
		sake: r.one.sakes({
			from: r.itemMatchSuggestions.suggestedSakeId,
			to: r.sakes.id
		}),
		spirit: r.one.spirits({
			from: r.itemMatchSuggestions.suggestedSpiritId,
			to: r.spirits.id
		}),
		tea: r.one.teas({
			from: r.itemMatchSuggestions.suggestedTeaId,
			to: r.teas.id
		}),
		wine: r.one.wines({
			from: r.itemMatchSuggestions.suggestedWineId,
			to: r.wines.id
		}),
	},
	recipes: {
		itemMatchSuggestions: r.many.itemMatchSuggestions(),
		placeMenuItems: r.many.placeMenuItems(),
		recipeIngredients: r.many.recipeIngredients(),
		recipeInstructions: r.many.recipeInstructions(),
		usersViaRecipeReviews: r.many.user({
			from: r.recipes.id.through(r.recipeReviews.recipeId),
			to: r.user.id.through(r.recipeReviews.userId),
			alias: "recipes_id_user_id_via_recipeReviews"
		}),
		recipeVectors: r.many.recipeVectors(),
		usersViaRecipeVotes: r.many.user({
			from: r.recipes.id.through(r.recipeVotes.recipeId),
			to: r.user.id.through(r.recipeVotes.userId),
			alias: "recipes_id_user_id_via_recipeVotes"
		}),
		recipe: r.one.recipes({
			from: r.recipes.canonicalRecipeId,
			to: r.recipes.id,
			alias: "recipes_canonicalRecipeId_recipes_id"
		}),
		recipes: r.many.recipes({
			alias: "recipes_canonicalRecipeId_recipes_id"
		}),
		user: r.one.user({
			from: r.recipes.createdById,
			to: r.user.id,
			alias: "recipes_createdById_user_id"
		}),
		recipeGroup: r.one.recipeGroups({
			from: r.recipes.recipeGroupId,
			to: r.recipeGroups.id
		}),
		menuItemRecipes: r.many.menuItemRecipes(),
		recipeGroupsCanonicalRecipeId: r.many.recipeGroups({
			alias: "recipeGroups_canonicalRecipeId_recipes_id"
		}),
		recipeReviews: r.many.recipeReviews(),
		recipeVotes: r.many.recipeVotes(),
	},
	itemReviews: {
		beer: r.one.beers({
			from: r.itemReviews.beerId,
			to: r.beers.id
		}),
		coffee: r.one.coffees({
			from: r.itemReviews.coffeeId,
			to: r.coffees.id
		}),
		sake: r.one.sakes({
			from: r.itemReviews.sakeId,
			to: r.sakes.id
		}),
		spirit: r.one.spirits({
			from: r.itemReviews.spiritId,
			to: r.spirits.id
		}),
		tea: r.one.teas({
			from: r.itemReviews.teaId,
			to: r.teas.id
		}),
		user: r.one.user({
			from: r.itemReviews.userId,
			to: r.user.id
		}),
		wine: r.one.wines({
			from: r.itemReviews.wineId,
			to: r.wines.id
		}),
	},
	itemVectors: {
		beer: r.one.beers({
			from: r.itemVectors.beerId,
			to: r.beers.id
		}),
		coffee: r.one.coffees({
			from: r.itemVectors.coffeeId,
			to: r.coffees.id
		}),
		sake: r.one.sakes({
			from: r.itemVectors.sakeId,
			to: r.sakes.id
		}),
		spirit: r.one.spirits({
			from: r.itemVectors.spiritId,
			to: r.spirits.id
		}),
		tea: r.one.teas({
			from: r.itemVectors.teaId,
			to: r.teas.id
		}),
		wine: r.one.wines({
			from: r.itemVectors.wineId,
			to: r.wines.id
		}),
	},
	menuScans: {
		placeEstimatedPlaceId: r.one.places({
			from: r.menuScans.estimatedPlaceId,
			to: r.places.id,
			alias: "menuScans_estimatedPlaceId_places_id"
		}),
		placeManualPlaceOverride: r.one.places({
			from: r.menuScans.manualPlaceOverride,
			to: r.places.id,
			alias: "menuScans_manualPlaceOverride_places_id"
		}),
		fileOriginalImageId: r.one.files({
			from: r.menuScans.originalImageId,
			to: r.files.id,
			alias: "menuScans_originalImageId_files_id"
		}),
		placePlaceId: r.one.places({
			from: r.menuScans.placeId,
			to: r.places.id,
			alias: "menuScans_placeId_places_id"
		}),
		fileProcessedImageId: r.one.files({
			from: r.menuScans.processedImageId,
			to: r.files.id,
			alias: "menuScans_processedImageId_files_id"
		}),
		user: r.one.user({
			from: r.menuScans.userId,
			to: r.user.id
		}),
		placeMenuItems: r.many.placeMenuItems(),
	},
	placeGoogleEnrichments: {
		place: r.one.places({
			from: r.placeGoogleEnrichments.placeId,
			to: r.places.id
		}),
	},
	placeMenus: {
		placeMenuItems: r.many.placeMenuItems(),
		userCreatedBy: r.one.user({
			from: r.placeMenus.createdBy,
			to: r.user.id,
			alias: "placeMenus_createdBy_user_id"
		}),
		place: r.one.places({
			from: r.placeMenus.placeId,
			to: r.places.id
		}),
		userVerifiedBy: r.one.user({
			from: r.placeMenus.verifiedBy,
			to: r.user.id,
			alias: "placeMenus_verifiedBy_user_id"
		}),
	},
	placeVectors: {
		place: r.one.places({
			from: r.placeVectors.placeId,
			to: r.places.id
		}),
	},
	recipeIngredients: {
		beer: r.one.beers({
			from: r.recipeIngredients.beerId,
			to: r.beers.id
		}),
		coffee: r.one.coffees({
			from: r.recipeIngredients.coffeeId,
			to: r.coffees.id
		}),
		genericItem: r.one.genericItems({
			from: r.recipeIngredients.genericItemId,
			to: r.genericItems.id
		}),
		recipe: r.one.recipes({
			from: r.recipeIngredients.recipeId,
			to: r.recipes.id
		}),
		sake: r.one.sakes({
			from: r.recipeIngredients.sakeId,
			to: r.sakes.id
		}),
		spirit: r.one.spirits({
			from: r.recipeIngredients.spiritId,
			to: r.spirits.id
		}),
		tea: r.one.teas({
			from: r.recipeIngredients.teaId,
			to: r.teas.id
		}),
		wine: r.one.wines({
			from: r.recipeIngredients.wineId,
			to: r.wines.id
		}),
	},
	recipeInstructions: {
		recipe: r.one.recipes({
			from: r.recipeInstructions.recipeId,
			to: r.recipes.id
		}),
	},
	recipeVectors: {
		recipe: r.one.recipes({
			from: r.recipeVectors.recipeId,
			to: r.recipes.id
		}),
	},
	recipeGroups: {
		recipes: r.many.recipes(),
		recipe: r.one.recipes({
			from: r.recipeGroups.canonicalRecipeId,
			to: r.recipes.id,
			alias: "recipeGroups_canonicalRecipeId_recipes_id"
		}),
		user: r.one.user({
			from: r.recipeGroups.createdById,
			to: r.user.id
		}),
	},
	sakeCategory: {
		sakes: r.many.sakes(),
	},
	sakeRiceVariety: {
		sakes: r.many.sakes(),
	},
	sakeType: {
		sakes: r.many.sakes(),
	},
	session: {
		user: r.one.user({
			from: r.session.userId,
			to: r.user.id
		}),
	},
	spiritType: {
		spirits: r.many.spirits(),
	},
	teaCategory: {
		teas: r.many.teas(),
	},
	tierListItems: {
		beer: r.one.beers({
			from: r.tierListItems.beerId,
			to: r.beers.id
		}),
		coffee: r.one.coffees({
			from: r.tierListItems.coffeeId,
			to: r.coffees.id
		}),
		place: r.one.places({
			from: r.tierListItems.placeId,
			to: r.places.id
		}),
		sake: r.one.sakes({
			from: r.tierListItems.sakeId,
			to: r.sakes.id
		}),
		spirit: r.one.spirits({
			from: r.tierListItems.spiritId,
			to: r.spirits.id
		}),
		tea: r.one.teas({
			from: r.tierListItems.teaId,
			to: r.teas.id
		}),
		tierList: r.one.tierLists({
			from: r.tierListItems.tierListId,
			to: r.tierLists.id
		}),
		wine: r.one.wines({
			from: r.tierListItems.wineId,
			to: r.wines.id
		}),
	},
	tierLists: {
		tierListItems: r.many.tierListItems(),
		user: r.one.user({
			from: r.tierLists.createdById,
			to: r.user.id
		}),
	},
	wineStyle: {
		wines: r.many.wines(),
	},
	wineVariety: {
		wines: r.many.wines(),
	},
	cellarOwners: {
		cellar: r.one.cellars({
			from: r.cellarOwners.cellarId,
			to: r.cellars.id
		}),
		user: r.one.user({
			from: r.cellarOwners.userId,
			to: r.user.id
		}),
	},
	checkIns: {
		cellarItem: r.one.cellarItems({
			from: r.checkIns.cellarItemId,
			to: r.cellarItems.id
		}),
		user: r.one.user({
			from: r.checkIns.userId,
			to: r.user.id
		}),
	},
	friendRequests: {
		friend: r.one.user({
			from: r.friendRequests.friendId,
			to: r.user.id,
			alias: "friendRequests_friendId_user_id"
		}),
		user: r.one.user({
			from: r.friendRequests.userId,
			to: r.user.id,
			alias: "friendRequests_userId_user_id"
		}),
	},
	friends: {
		friend: r.one.user({
			from: r.friends.friendId,
			to: r.user.id,
			alias: "friends_friendId_user_id"
		}),
		user: r.one.user({
			from: r.friends.userId,
			to: r.user.id,
			alias: "friends_userId_user_id"
		}),
	},
	menuItemRecipes: {
		placeMenuItem: r.one.placeMenuItems({
			from: r.menuItemRecipes.menuItemId,
			to: r.placeMenuItems.id
		}),
		recipe: r.one.recipes({
			from: r.menuItemRecipes.recipeId,
			to: r.recipes.id
		}),
	},
	placeBrands: {
		brand: r.one.brands({
			from: r.placeBrands.brandId,
			to: r.brands.id
		}),
		place: r.one.places({
			from: r.placeBrands.placeId,
			to: r.places.id
		}),
	},
	placeGooglePhotos: {
		place: r.one.places({
			from: r.placeGooglePhotos.placeId,
			to: r.places.id
		}),
		file: r.one.files({
			from: r.placeGooglePhotos.storageFileId,
			to: r.files.id
		}),
	},
	recipeReviews: {
		recipe: r.one.recipes({
			from: r.recipeReviews.recipeId,
			to: r.recipes.id
		}),
		user: r.one.user({
			from: r.recipeReviews.userId,
			to: r.user.id
		}),
	},
	recipeVotes: {
		recipe: r.one.recipes({
			from: r.recipeVotes.recipeId,
			to: r.recipes.id
		}),
		user: r.one.user({
			from: r.recipeVotes.userId,
			to: r.user.id
		}),
	},
	userPlaceInteractions: {
		place: r.one.places({
			from: r.userPlaceInteractions.placeId,
			to: r.places.id
		}),
		user: r.one.user({
			from: r.userPlaceInteractions.userId,
			to: r.user.id
		}),
	},
}))
