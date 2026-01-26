-- Seed generic_items with common ingredients
-- Spirits, wines, beers, coffee, and cocktail ingredients

INSERT INTO public.generic_items (name, category, subcategory, item_type, description, is_substitutable) VALUES
-- Spirits
('Whiskey', 'spirit', 'whiskey', 'spirit', 'Generic whiskey category including bourbon, rye, scotch, etc.', true),
('Vodka', 'spirit', 'vodka', 'spirit', 'Clear distilled spirit', true),
('Gin', 'spirit', 'gin', 'spirit', 'Juniper-flavored spirit', true),
('Rum', 'spirit', 'rum', 'spirit', 'Sugar cane distilled spirit', true),
('Tequila', 'spirit', 'tequila', 'spirit', 'Agave-based spirit', true),
('Bourbon', 'spirit', 'whiskey', 'spirit', 'American whiskey with at least 51% corn', true),
('Scotch', 'spirit', 'whiskey', 'spirit', 'Scottish whiskey', true),
('Rye Whiskey', 'spirit', 'whiskey', 'spirit', 'Whiskey with at least 51% rye', true),

-- Wine categories
('Red Wine', 'wine', 'red', 'wine', 'Generic red wine category', true),
('White Wine', 'wine', 'white', 'wine', 'Generic white wine category', true),
('Rosé Wine', 'wine', 'rosé', 'wine', 'Pink wine category', true),
('Sparkling Wine', 'wine', 'sparkling', 'wine', 'Effervescent wine including champagne', true),
('Champagne', 'wine', 'sparkling', 'wine', 'French sparkling wine from Champagne region', true),
('Pinot Noir', 'wine', 'red', 'wine', 'Light to medium-bodied red wine', true),
('Cabernet Sauvignon', 'wine', 'red', 'wine', 'Full-bodied red wine', true),
('Chardonnay', 'wine', 'white', 'wine', 'Full-bodied white wine', true),
('Sauvignon Blanc', 'wine', 'white', 'wine', 'Crisp white wine', true),

-- Beer categories
('IPA', 'beer', 'ale', 'beer', 'India Pale Ale - hoppy beer style', true),
('Lager', 'beer', 'lager', 'beer', 'Bottom-fermented beer', true),
('Stout', 'beer', 'stout', 'beer', 'Dark, rich beer style', true),
('Pilsner', 'beer', 'lager', 'beer', 'Light, crisp lager', true),
('Wheat Beer', 'beer', 'wheat', 'beer', 'Beer made with wheat', true),
('Porter', 'beer', 'porter', 'beer', 'Dark brown beer style', true),

-- Coffee categories
('Espresso', 'coffee', 'espresso', 'coffee', 'Concentrated coffee', true),
('Cold Brew', 'coffee', 'cold_brew', 'coffee', 'Cold-extracted coffee', true),
('Light Roast', 'coffee', 'light', 'coffee', 'Lightly roasted coffee beans', true),
('Dark Roast', 'coffee', 'dark', 'coffee', 'Darkly roasted coffee beans', true),

-- Cocktail mixers and ingredients
('Simple Syrup', 'mixer', 'sweetener', 'ingredient', 'Sugar syrup used in cocktails', true),
('Lime Juice', 'citrus', 'fresh', 'ingredient', 'Fresh lime juice', true),
('Lemon Juice', 'citrus', 'fresh', 'ingredient', 'Fresh lemon juice', true),
('Orange Juice', 'citrus', 'fresh', 'ingredient', 'Fresh orange juice', true),
('Angostura Bitters', 'bitters', 'aromatic', 'ingredient', 'Classic aromatic bitters', true),
('Orange Bitters', 'bitters', 'citrus', 'ingredient', 'Orange-flavored bitters', true),
('Grenadine', 'mixer', 'sweetener', 'ingredient', 'Pomegranate syrup', true),
('Club Soda', 'mixer', 'carbonated', 'ingredient', 'Carbonated water', true),
('Tonic Water', 'mixer', 'carbonated', 'ingredient', 'Quinine-flavored carbonated water', true),
('Ginger Beer', 'mixer', 'carbonated', 'ingredient', 'Spicy ginger-flavored soda', true),
('Triple Sec', 'liqueur', 'orange', 'ingredient', 'Orange-flavored liqueur', true),
('Cointreau', 'liqueur', 'orange', 'ingredient', 'Premium orange liqueur', true),
('Vermouth', 'fortified_wine', 'aromatized', 'ingredient', 'Fortified and aromatized wine', true),
('Dry Vermouth', 'fortified_wine', 'dry', 'ingredient', 'Dry fortified wine', true),
('Sweet Vermouth', 'fortified_wine', 'sweet', 'ingredient', 'Sweet fortified wine', true)