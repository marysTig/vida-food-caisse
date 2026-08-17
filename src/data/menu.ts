import pizzaMargherita from "@/assets/pizza-margherita.jpg";
import pizza4Fromages from "@/assets/pizza-4-fromages.jpg";
import pizzaViande from "@/assets/pizza-viande.jpg";
import burgerClassic from "@/assets/burger-classic.jpg";
import burgerChicken from "@/assets/burger-chicken.jpg";
import burgerDouble from "@/assets/burger-double.jpg";
import frites from "@/assets/frites.jpg";
import coca from "@/assets/coca.jpg";
import eau from "@/assets/eau.jpg";
import tiramisu from "@/assets/tiramisu.jpg";

export type Category = "Tous" | "Pizzas" | "Burgers" | "Plats" | "Boissons" | "Desserts";

export const categories: Category[] = [
  "Tous",
  "Pizzas",
  "Burgers",
  "Plats",
  "Boissons",
  "Desserts",
];

export type Product = {
  id: string;
  name: string;
  category: Exclude<Category, "Tous">;
  price: number;
  image: string;
  available: boolean;
};

export type Supplement = { id: string; label: string; price: number };

export const supplements: Supplement[] = [
  { id: "cheese", label: "Fromage", price: 100 },
  { id: "egg", label: "Œuf", price: 100 },
  { id: "bacon", label: "Bacon", price: 150 },
];

export const products: Product[] = [
  { id: "p1", name: "Pizza Margherita", category: "Pizzas", price: 650, image: pizzaMargherita, available: true },
  { id: "p2", name: "Pizza 4 Fromages", category: "Pizzas", price: 900, image: pizza4Fromages, available: true },
  { id: "p3", name: "Pizza Viande", category: "Pizzas", price: 950, image: pizzaViande, available: true },
  { id: "p4", name: "Burger Classic", category: "Burgers", price: 750, image: burgerClassic, available: true },
  { id: "p5", name: "Chicken Burger", category: "Burgers", price: 800, image: burgerChicken, available: true },
  { id: "p6", name: "Double Burger", category: "Burgers", price: 950, image: burgerDouble, available: false },
  { id: "p7", name: "Frites", category: "Plats", price: 250, image: frites, available: true },
  { id: "p8", name: "Coca Cola", category: "Boissons", price: 120, image: coca, available: true },
  { id: "p9", name: "Eau", category: "Boissons", price: 80, image: eau, available: true },
  { id: "p10", name: "Tiramisu", category: "Desserts", price: 400, image: tiramisu, available: true },
];

export function formatDA(amount: number) {
  return `${amount.toLocaleString("fr-FR").replace(/\u202f|\u00a0/g, " ")} DA`;
}
