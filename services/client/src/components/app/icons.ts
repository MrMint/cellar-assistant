/**
 * The app's icon vocabulary (design-direction.md §3.4): Lucide, named by
 * *meaning* rather than by picture, so a converted file imports `Back` or
 * `Love` and a later glyph swap happens here once.
 *
 * Every react-icons name the app used before the migration maps to one of
 * these; the table is in `README.md` ("Icons"). Draw them at a 1.75 stroke — `IconButton`, the tab
 * bar and the ui/* components already do; elsewhere pass
 * `strokeWidth={ICON_STROKE}`.
 *
 * Not here, on purpose:
 * - brand marks (Google, Facebook, Discord): Lucide v1 ships no logos, and the
 *   providers' own marks are the right ones — inline SVG in SocialButtons;
 * - the six beverage glyphs: `TypeGlyph` (app/TypeChip.tsx) owns those.
 */

export type {
  LucideIcon as AppIcon,
  LucideProps as AppIconProps,
} from "lucide-react";
export {
  ArrowDown as SortDescending,
  ArrowLeft as Back,
  ArrowUpDown as Arrange,
  Award as Medal,
  BadgeCheck as Verified,
  Bell as Notifications,
  BookOpen as Recipe,
  Building2 as Business,
  Camera,
  ChartNoAxesColumn as Leaderboard,
  Check,
  ChevronDown,
  ChevronRight,
  CircleAlert as ErrorIcon,
  CircleCheck as Success,
  CircleDashed as Unrated,
  CircleHelp as Help,
  CircleMinus as RemoveFromList,
  Clock as Time,
  CloudOff,
  Coins as Price,
  Compass as Explore,
  Crown,
  DollarSign as Money,
  Ellipsis as More,
  Eye as Visible,
  Filter,
  Flame as Popular,
  Globe as Public,
  GripVertical as DragHandle,
  Heart as Love,
  History,
  Hourglass as Pending,
  House as Home,
  Image as Photo,
  Images as PhotoLibrary,
  Info,
  Layers,
  LayoutList as ListView,
  Lightbulb as Idea,
  ListOrdered as Ranked,
  LocateFixed as MyLocation,
  Lock,
  LockOpen as Unlock,
  Map as MapIcon,
  MapPin as Place,
  MapPinPlus as AddPlace,
  Martini as Cocktail,
  MessageSquare as Comment,
  Moon as DarkMode,
  Navigation as Directions,
  Pencil as Edit,
  Phone,
  Plus as Add,
  RefreshCw as Refresh,
  RotateCcw as Undo,
  RotateCw as Redo,
  ScanBarcode as Barcode,
  ScanLine as Scan,
  Search,
  SearchX as NoResults,
  Settings,
  Shapes as Category,
  Share2 as Share,
  SignalLow as WeakSignal,
  Sparkles as AI,
  Star,
  Store,
  Sun as LightMode,
  ThumbsDown,
  ThumbsUp,
  Timer as Schedule,
  Trash2 as Delete,
  TrendingUp as Trending,
  TriangleAlert as Warning,
  Trophy,
  User as Person,
  UserRound as Me,
  Users as People,
  Utensils as Restaurant,
  Wand as AutoFill,
  Warehouse as Cellar,
  WifiOff as Offline,
  X as Close,
} from "lucide-react";

/** The stroke every app icon is drawn at (design §3.4). */
export const ICON_STROKE = 1.75;
