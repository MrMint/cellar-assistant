-- Remove seeded generic items
DELETE FROM public.generic_items WHERE name IN (
  'Whiskey', 'Vodka', 'Gin', 'Rum', 'Tequila', 'Bourbon', 'Scotch', 'Rye Whiskey',
  'Red Wine', 'White Wine', 'Rosé Wine', 'Sparkling Wine', 'Champagne', 'Pinot Noir', 
  'Cabernet Sauvignon', 'Chardonnay', 'Sauvignon Blanc',
  'IPA', 'Lager', 'Stout', 'Pilsner', 'Wheat Beer', 'Porter',
  'Espresso', 'Cold Brew', 'Light Roast', 'Dark Roast',
  'Simple Syrup', 'Lime Juice', 'Lemon Juice', 'Orange Juice', 'Angostura Bitters', 
  'Orange Bitters', 'Grenadine', 'Club Soda', 'Tonic Water', 'Ginger Beer', 
  'Triple Sec', 'Cointreau', 'Vermouth', 'Dry Vermouth', 'Sweet Vermouth'
);