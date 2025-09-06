
# Competitor Lemonade Design System

## Overview

This design system is based on the "Lemonade" brand identity - bright, energetic, and professional. It combines the playful lemon metaphor with clean, modern design principles for competitive intelligence applications.

## Brand Identity

### Core Concept
- **Brand Name**: Competitor Lemonade
- **Primary Logo**: 🍋 (Lemon emoji on bright yellow circular background)
- **Tagline**: "Squeeze the most out of your competitive intelligence"
- **Personality**: Bright, energetic, professional with playful energy

## Color System

### Primary Brand Colors

```css
/* Primary Yellow - Main brand color */
--primary: hsl(58, 100%, 52%);           /* #ffe606 */
--primary-foreground: hsl(0, 0%, 0%);    /* Black text on yellow */

/* Brand Yellow Alternative */
--brand-yellow: #ffff00;                 /* Pure yellow variant */
```

### Neutral Colors

```css
/* Backgrounds */
--background: hsl(0, 0%, 100%);          /* Pure white */
--card: hsl(0, 0%, 100%);                /* White cards */
--muted: hsl(0, 0%, 96%);                /* Light gray #f5f5f5 */

/* Text Colors */
--foreground: hsl(0, 0%, 0%);            /* Pure black */
--muted-foreground: hsl(0, 0%, 45%);     /* Medium gray #737373 */

/* Accents */
--accent: hsl(0, 0%, 0%);                /* Black accents */
--accent-foreground: hsl(0, 0%, 100%);   /* White on black */

/* Borders */
--border: hsl(0, 0%, 90%);               /* Light gray #e5e5e5 */
--input: hsl(0, 0%, 90%);                /* Input borders */
```

### Status Colors

```css
/* Success/Excellent (80+) */
--success-green: hsl(142, 76%, 36%);     /* #16a34a */

/* Warning/Good (60-79) */
--warning-gold: #FFD700;                 /* Gold with glow effect */

/* Destructive/Poor (<60) */
--destructive: hsl(0, 84%, 60%);         /* #ef4444 */
--destructive-foreground: hsl(0, 0%, 98%);

/* Soft Pastel Palette */
--soft-green: #e6f4bd;
--soft-blue: #bceaf6;
--mint-green: #9dded6;
--soft-pink: #ffdee6;
--peach: #fcceb2;
```

### Tailwind Color Classes

```css
/* Background Colors */
.bg-brand-yellow { background-color: #ffff00; }
.bg-soft-green { background-color: #e6f4bd; }
.bg-soft-blue { background-color: #bceaf6; }
.bg-mint-green { background-color: #9dded6; }
.bg-soft-pink { background-color: #ffdee6; }
.bg-peach { background-color: #fcceb2; }

/* Score Status Classes */
.score-excellent { @apply bg-green-600 text-white; }
.score-good { 
  background-color: #FFD700; 
  color: black; 
  box-shadow: 0 0 10px rgba(255, 215, 0, 0.5); 
}
.score-poor { @apply bg-destructive text-destructive-foreground; }
```

## Typography

### Font Family
```css
font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
font-weight: 500; /* Default medium weight */
letter-spacing: -0.025em; /* Tighter spacing for headings */
```

### Heading Hierarchy

```css
/* Hero Headlines - Maximum Impact */
.hero-headline {
  @apply text-6xl lg:text-7xl font-black leading-tight;
}

/* Primary Headings */
h1 { @apply text-4xl lg:text-6xl font-extrabold leading-tight; }

/* Secondary Headings */
h2 { @apply text-3xl lg:text-4xl font-bold; }

/* Tertiary Headings */
h3 { @apply text-2xl lg:text-3xl font-bold; }

/* Highlighted Text */
.highlighted-text {
  @apply bg-primary text-primary-foreground px-2 py-1 rounded;
}
```

### Text Sizes

```css
/* Large Text */
.text-xl { font-size: 1.25rem; line-height: 1.75rem; }

/* Body Text */
.text-base { font-size: 1rem; line-height: 1.5rem; }

/* Small Text */
.text-sm { font-size: 0.875rem; line-height: 1.25rem; }

/* Caption Text */
.text-xs { font-size: 0.75rem; line-height: 1rem; }
```

## Layout & Spacing

### Container System

```css
/* Main Container */
.container-main {
  @apply max-w-7xl mx-auto px-4 sm:px-6 lg:px-8;
}

/* Content Widths */
.max-w-content { max-width: 896px; }      /* Hero sections */
.max-w-form { max-width: 448px; }         /* Forms */
.max-w-main { max-width: 1280px; }        /* Main content */
```

### Border Radius

```css
--radius: 1rem; /* 16px standard radius */

/* Radius Classes */
.card-rounded { @apply rounded-2xl; }     /* 16px for cards */
.rounded-full { border-radius: 9999px; }  /* Fully rounded buttons */
```

### Spacing Scale

```css
/* Padding */
.p-3 { padding: 0.75rem; }    /* 12px */
.p-4 { padding: 1rem; }       /* 16px */
.p-6 { padding: 1.5rem; }     /* 24px */
.p-8 { padding: 2rem; }       /* 32px */

/* Margins */
.mb-2 { margin-bottom: 0.5rem; }   /* 8px */
.mb-4 { margin-bottom: 1rem; }     /* 16px */
.mb-6 { margin-bottom: 1.5rem; }   /* 24px */

/* Gaps */
.gap-4 { gap: 1rem; }         /* 16px */
.gap-6 { gap: 1.5rem; }       /* 24px */
.gap-8 { gap: 2rem; }         /* 32px */
```

## Component Library

### Buttons

#### Primary Button

```tsx
// Usage
<Button className="btn-primary">
  🍋 Start Analyzing Competitors
</Button>

// CSS Class
.btn-primary {
  @apply bg-primary text-primary-foreground px-8 py-4 rounded-full font-bold text-lg shadow-lg hover:shadow-xl transition-all duration-200 hover:scale-105;
}
```

#### Secondary Button

```tsx
// Usage
<Button className="btn-secondary">
  Log In
</Button>

// CSS Class
.btn-secondary {
  @apply bg-accent text-accent-foreground px-6 py-3 rounded-full font-semibold border-2 border-accent transition-all duration-200 hover:bg-gray-800;
}
```

#### Button Variants (shadcn/ui)

```tsx
import { Button } from "@/components/ui/button";

// Default
<Button>Click me</Button>

// Primary (custom)
<Button className="btn-primary">Primary Action</Button>

// Secondary
<Button variant="secondary">Secondary</Button>

// Destructive
<Button variant="destructive">Delete</Button>

// Ghost
<Button variant="ghost">Ghost</Button>

// Link
<Button variant="link">Link Button</Button>
```

### Cards

#### Standard Card

```tsx
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

// Basic Card
<Card className="card-rounded hover-lift">
  <CardContent className="p-8">
    <h3 className="text-xl font-bold mb-4">Card Title</h3>
    <p className="text-muted-foreground">Card content goes here.</p>
  </CardContent>
</Card>

// CSS Classes
.card-rounded {
  @apply rounded-2xl shadow-sm border border-gray-100;
  border-width: 0.5px;
}

.hover-lift {
  @apply transition-all duration-200 hover:scale-105 hover:shadow-lg;
}
```

#### Stats Card Component

```tsx
import { LucideIcon } from "lucide-react";

interface StatsCardProps {
  title: string;
  value: string | number;
  icon: LucideIcon;
  bgColor: string;
}

function StatsCard({ title, value, icon: Icon, bgColor }: StatsCardProps) {
  return (
    <Card className="card-rounded">
      <CardContent className="p-6">
        <div className="flex items-center space-x-4">
          <div className={`w-12 h-12 rounded-lg flex items-center justify-center ${bgColor}`}>
            <Icon className="w-6 h-6 text-gray-700" />
          </div>
          <div>
            <p className="text-2xl font-bold text-black">{value}</p>
            <p className="text-sm text-gray-600">{title}</p>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

// Usage
<StatsCard 
  title="Total Analyses" 
  value={42} 
  icon={TrendingUp} 
  bgColor="bg-soft-blue" 
/>
```

#### Activity Card Component

```tsx
import { LucideIcon } from "lucide-react";

interface ActivityCardProps {
  type: 'funding' | 'product' | 'news' | 'pricing';
  icon: LucideIcon;
  title: string;
  description: string;
  timestamp: string;
  company: string;
}

const activityColors = {
  funding: 'bg-peach',
  product: 'bg-soft-blue', 
  news: 'bg-soft-pink',
  pricing: 'bg-mint-green'
};

function ActivityCard({ type, icon: Icon, title, description, timestamp, company }: ActivityCardProps) {
  return (
    <Card className="bg-gray-50">
      <CardContent className="p-4">
        <div className="flex gap-4">
          <div className={`w-10 h-10 rounded-full flex items-center justify-center ${activityColors[type]}`}>
            <Icon className="w-5 h-5 text-gray-700" />
          </div>
          <div className="flex-1">
            <div className="flex items-center gap-2 mb-1">
              <span className={`px-2 py-1 rounded text-xs font-medium ${activityColors[type]} text-gray-700`}>
                {type.charAt(0).toUpperCase() + type.slice(1)}
              </span>
              <span className="text-xs text-gray-500">{timestamp}</span>
            </div>
            <h4 className="font-medium text-black mb-1">{title}</h4>
            <p className="text-sm text-gray-600 mb-2">{description}</p>
            <p className="text-xs text-gray-500">{company}</p>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
```

#### Competitor Card Component

```tsx
interface CompetitorCardProps {
  name: string;
  url: string;
  isActive: boolean;
  avatarIndex: number;
}

const avatarColors = [
  'bg-soft-blue',
  'bg-soft-pink', 
  'bg-peach',
  'bg-mint-green',
  'bg-brand-yellow'
];

function CompetitorCard({ name, url, isActive, avatarIndex }: CompetitorCardProps) {
  const initials = name.split(' ').map(n => n[0]).join('').toUpperCase();
  
  return (
    <Card className="card-rounded">
      <CardContent className="p-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className={`w-8 h-8 rounded-full flex items-center justify-center ${avatarColors[avatarIndex % 5]}`}>
              <span className="text-xs font-bold text-gray-700">{initials}</span>
            </div>
            <div>
              <h4 className="font-medium text-black">{name}</h4>
              <p className="text-xs text-gray-500">{url}</p>
            </div>
          </div>
          <div className={`w-2 h-2 rounded-full ${isActive ? 'bg-mint-green' : 'bg-gray-400'}`} />
        </div>
      </CardContent>
    </Card>
  );
}
```

### Sections

#### Section Backgrounds

```tsx
// Yellow Section
<section className="section-yellow p-16 text-center">
  <h2 className="text-4xl font-bold mb-6">Ready to analyze your competition?</h2>
  <p className="text-xl mb-8">Join thousands of businesses using Competitor Lemonade.</p>
</section>

// Black Section  
<section className="section-black p-16">
  <div className="text-center">
    <h2 className="text-3xl font-bold text-white mb-6">Features</h2>
  </div>
</section>

// CSS Classes
.section-yellow {
  @apply bg-primary text-primary-foreground;
}

.section-black {
  @apply bg-accent text-accent-foreground;
}
```

#### Gradient Backgrounds

```css
/* Lemon Gradient */
.lemon-gradient {
  background: linear-gradient(135deg, hsl(60, 100%, 50%) 0%, hsl(55, 100%, 45%) 100%);
}

/* Landing Page Gradient */
.landing-gradient {
  @apply bg-gradient-to-br from-primary/20 via-background to-accent/5;
}
```

### Progress Elements

#### Progress Bars

```tsx
import { Progress } from "@/components/ui/progress";

// Basic Progress
<Progress value={65} className="w-full" />

// Custom Styled Progress
<div className="w-full bg-gray-200 rounded-full h-3">
  <div 
    className="h-3 rounded-full transition-all duration-1000 ease-out"
    style={{ 
      backgroundColor: '#ffff00', 
      width: '65%' 
    }}
  />
</div>

// Score-based Progress Colors
function getScoreColor(score: number) {
  if (score >= 80) return 'bg-green-600';
  if (score >= 60) return 'bg-yellow-500';
  return 'bg-red-500';
}
```

#### Circular Progress (Score Cards)

```tsx
interface CircularProgressProps {
  score: number;
  size?: number;
}

function CircularProgress({ score, size = 128 }: CircularProgressProps) {
  const radius = 40;
  const circumference = 2 * Math.PI * radius;
  const strokeDashoffset = circumference - (score / 100) * circumference;

  return (
    <div className="relative">
      <svg width={size} height={size} className="transform -rotate-90">
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          stroke="rgb(229, 231, 235)"
          strokeWidth="8"
          fill="transparent"
        />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          stroke="#ffff00"
          strokeWidth="8"
          fill="transparent"
          strokeDasharray={circumference}
          strokeDashoffset={strokeDashoffset}
          className="transition-all duration-1000 ease-out"
        />
      </svg>
      <div className="absolute inset-0 flex items-center justify-center">
        <span className="text-2xl font-bold">{score}</span>
      </div>
    </div>
  );
}
```

### Navigation

#### Header Component

```tsx
function Header() {
  return (
    <header className="sticky top-0 z-50 bg-background border-b shadow-sm">
      <div className="container-main py-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-3">
            <div className="w-10 h-10 bg-primary rounded-full flex items-center justify-center">
              🍋
            </div>
            <h1 className="text-2xl font-bold text-foreground">
              Competitor Lemonade
            </h1>
          </div>
          <a href="/api/login">
            <Button className="btn-secondary">Log In</Button>
          </a>
        </div>
      </div>
    </header>
  );
}
```

### Forms

#### Input Components

```tsx
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

// Standard Input
<div className="space-y-2">
  <Label htmlFor="email">Email</Label>
  <Input 
    id="email" 
    type="email" 
    placeholder="Enter your email"
    className="rounded-full"
  />
</div>

// Input with Icon
<div className="relative">
  <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-gray-400" />
  <Input 
    placeholder="Search competitors..."
    className="pl-10 rounded-full"
  />
</div>
```

#### Form Layout

```tsx
<form className="space-y-6 max-w-md mx-auto">
  <div className="space-y-4">
    <div>
      <Label htmlFor="company">Company Name</Label>
      <Input id="company" placeholder="Enter company name" />
    </div>
    <div>
      <Label htmlFor="url">Website URL</Label>
      <Input id="url" type="url" placeholder="https://example.com" />
    </div>
  </div>
  <Button type="submit" className="btn-primary w-full">
    Analyze Competitor
  </Button>
</form>
```

### Modals

#### Basic Modal Pattern

```tsx
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";

<Dialog>
  <DialogTrigger asChild>
    <Button className="btn-primary">Add Competitor</Button>
  </DialogTrigger>
  <DialogContent className="sm:max-w-md">
    <DialogHeader>
      <DialogTitle>Add New Competitor</DialogTitle>
      <DialogDescription>
        Enter the competitor's information to start monitoring.
      </DialogDescription>
    </DialogHeader>
    <form className="space-y-4">
      <div>
        <Label htmlFor="name">Company Name</Label>
        <Input id="name" placeholder="Competitor name" />
      </div>
      <div>
        <Label htmlFor="website">Website</Label>
        <Input id="website" type="url" placeholder="https://..." />
      </div>
      <div className="flex justify-end gap-3">
        <Button variant="outline" type="button">Cancel</Button>
        <Button type="submit" className="btn-primary">Add Competitor</Button>
      </div>
    </form>
  </DialogContent>
</Dialog>
```

## Grid System

### Responsive Grids

```tsx
// Stats Grid
<div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
  {stats.map((stat, index) => (
    <StatsCard key={index} {...stat} />
  ))}
</div>

// Content Grid (2:1 Ratio)
<div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
  <div className="lg:col-span-2">
    {/* Main Content */}
  </div>
  <div className="lg:col-span-1">
    {/* Sidebar */}
  </div>
</div>

// Feature Grid
<div className="grid grid-cols-1 md:grid-cols-3 gap-8">
  {features.map((feature, index) => (
    <Card key={index} className="card-rounded hover-lift">
      <CardContent className="p-8 text-center">
        <div className="w-16 h-16 bg-primary rounded-full flex items-center justify-center mx-auto mb-6">
          {feature.emoji}
        </div>
        <h3 className="text-xl font-bold mb-4">{feature.title}</h3>
        <p className="text-muted-foreground">{feature.description}</p>
      </CardContent>
    </Card>
  ))}
</div>
```

## Interactive States

### Hover Effects

```css
/* Button Hover */
.hover-scale {
  @apply transition-all duration-200 hover:scale-105;
}

/* Card Hover */
.hover-lift {
  @apply transition-all duration-200 hover:scale-105 hover:shadow-lg;
}

/* Link Hover */
.hover-primary {
  @apply transition-colors duration-200 hover:text-primary;
}
```

### Loading States

```tsx
import { Skeleton } from "@/components/ui/skeleton";

// Loading Card
<Card className="card-rounded">
  <CardContent className="p-6">
    <div className="flex items-center space-x-4">
      <Skeleton className="h-12 w-12 rounded-lg" />
      <div className="space-y-2">
        <Skeleton className="h-4 w-[100px]" />
        <Skeleton className="h-4 w-[60px]" />
      </div>
    </div>
  </CardContent>
</Card>

// Loading Button
<Button disabled className="btn-primary">
  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
  Analyzing...
</Button>
```

## Icons

### Icon System (Lucide React)

```tsx
import { 
  TrendingUp, 
  Users, 
  DollarSign, 
  Mail,
  Plus,
  Search,
  Menu,
  X,
  MoreHorizontal,
  Edit,
  Trash2
} from "lucide-react";

// Standard Icon Usage
<TrendingUp className="w-6 h-6 text-gray-700" />

// Icon with Background
<div className="w-12 h-12 bg-soft-blue rounded-lg flex items-center justify-center">
  <Users className="w-6 h-6 text-gray-700" />
</div>

// Icon Sizes
<Icon className="w-4 h-4" />  {/* Small - 16px */}
<Icon className="w-5 h-5" />  {/* Medium - 20px */}
<Icon className="w-6 h-6" />  {/* Large - 24px */}
```

## Breakpoints & Responsiveness

### Tailwind Breakpoints

```css
/* Mobile First Approach */
/* sm: 640px */
/* md: 768px */
/* lg: 1024px */
/* xl: 1280px */
/* 2xl: 1536px */

/* Responsive Text */
.responsive-heading {
  @apply text-4xl md:text-5xl lg:text-6xl;
}

/* Responsive Grid */
.responsive-grid {
  @apply grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4;
}

/* Responsive Padding */
.responsive-padding {
  @apply px-4 sm:px-6 lg:px-8;
}
```

### Mobile Navigation

```tsx
import { useState } from "react";
import { Menu, X } from "lucide-react";

function MobileNav() {
  const [isOpen, setIsOpen] = useState(false);

  return (
    <div className="md:hidden">
      <Button
        variant="ghost"
        size="sm"
        onClick={() => setIsOpen(!isOpen)}
      >
        {isOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
      </Button>
      
      {isOpen && (
        <div className="absolute top-full left-0 right-0 bg-white border-t shadow-lg">
          <nav className="p-4 space-y-2">
            <a href="/dashboard" className="block py-2 text-gray-600 hover:text-black">
              Dashboard
            </a>
            <a href="/competitors" className="block py-2 text-gray-600 hover:text-black">
              Competitors
            </a>
          </nav>
        </div>
      )}
    </div>
  );
}
```

## Usage Guidelines

### Do's
- ✅ Use bright primary yellow (#ffe606) for key actions and brand elements
- ✅ Maintain high contrast with black and white
- ✅ Use lemon emoji (🍋) consistently for brand recognition
- ✅ Apply rounded corners generously (especially full rounds for buttons)
- ✅ Use bold, confident typography for headlines
- ✅ Implement smooth transitions and hover effects
- ✅ Keep layouts clean with generous whitespace

### Don'ts
- ❌ Never change the core yellow color (#ffe606)
- ❌ Don't use primary yellow for large background areas
- ❌ Avoid mixing rounded and sharp corners in the same component
- ❌ Don't use more than 3 colors in a single component
- ❌ Never compromise text readability for design
- ❌ Don't remove the lemon branding elements
- ❌ Avoid cluttered layouts

### Accessibility
- **Contrast**: All text meets WCAG AA standards
- **Focus**: Visible focus indicators on interactive elements
- **Text Size**: Minimum 16px for body text
- **Color**: Never rely on color alone for information
- **Alt Text**: Descriptive alt text for all images

## Quick Start Template

```tsx
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { TrendingUp } from "lucide-react";

function LemonadeTemplate() {
  return (
    <div className="min-h-screen bg-gradient-to-br from-primary/20 via-background to-accent/5">
      {/* Header */}
      <header className="sticky top-0 z-50 bg-background border-b shadow-sm">
        <div className="container-main py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-3">
              <div className="w-10 h-10 bg-primary rounded-full flex items-center justify-center">
                🍋
              </div>
              <h1 className="text-2xl font-bold">Your App Name</h1>
            </div>
            <Button className="btn-secondary">Action</Button>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="container-main py-20">
        <div className="text-center mb-20">
          <h1 className="hero-headline mb-8">
            Your <span className="highlighted-text">amazing</span> headline
          </h1>
          <p className="text-xl text-muted-foreground mb-12 max-w-4xl mx-auto">
            Your compelling description goes here.
          </p>
          <Button className="btn-primary">
            🍋 Get Started
          </Button>
        </div>

        {/* Features Grid */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
          <Card className="card-rounded hover-lift">
            <CardContent className="p-8 text-center">
              <div className="w-16 h-16 bg-soft-blue rounded-full flex items-center justify-center mx-auto mb-6">
                <TrendingUp className="w-8 h-8 text-gray-700" />
              </div>
              <h3 className="text-xl font-bold mb-4">Feature Title</h3>
              <p className="text-muted-foreground">Feature description</p>
            </CardContent>
          </Card>
        </div>
      </main>
    </div>
  );
}
```

This design system provides a complete foundation for building consistent, branded applications with the Lemonade aesthetic. Copy the CSS variables, component patterns, and usage guidelines to maintain brand consistency across all your projects.
