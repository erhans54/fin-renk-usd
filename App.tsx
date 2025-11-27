import React, { useState, useEffect, useMemo } from 'react';
import { initializeApp } from 'firebase/app';
import { 
	getAuth, signInAnonymously, signInWithCustomToken, onAuthStateChanged 
} from 'firebase/auth';
import { 
	getFirestore, collection, onSnapshot, doc, 
	deleteDoc, runTransaction, setDoc, updateDoc,
	QuerySnapshot, DocumentData
} from 'firebase/firestore';
import { DollarSign, Repeat, Plus, Edit, Trash2, Wallet, CreditCard, Landmark, Loader, AlertTriangle, X, Copy, TrendingUp, TrendingDown, Settings, List, Send, Menu, LayoutDashboard, Save, RefreshCw } from 'lucide-react';

// --- Types ---
interface WalletData {
    id: string;
    name: string;
    type: string;
    currency: string;
    balance: number;
    color: string;
    createdAt?: any;
}

interface TransactionData {
    id: string;
    type: 'income' | 'expense' | 'transfer';
    amount: number;
    walletId?: string;
    walletName?: string;
    categoryId?: string;
    categoryName?: string;
    description?: string;
    date: Date;
    currency?: string;
    // Transfer specific
    sourceWalletId?: string;
    sourceWalletName?: string;
    sourceCurrency?: string;
    targetWalletId?: string;
    targetWalletName?: string;
    targetCurrency?: string;
    createdAt?: any;
}

interface CategoryData {
    id: string;
    name: string;
    type: 'income' | 'expense';
    isDefault: boolean;
}

// --- Global Variable Declarations for TypeScript ---
declare var __app_id: string | undefined;
declare var __firebase_config: string | undefined;
declare var __initial_auth_token: string | undefined;

// --- Firebase Global Variables ---
// Safely retrieve globals or defaults
const getGlobal = (key: string, defaultVal: any) => {
    // @ts-ignore
    if (typeof window !== 'undefined' && window[key] !== undefined) return window[key];
    // @ts-ignore
    if (typeof __app_id !== 'undefined' && key === '__app_id') return __app_id;
    // @ts-ignore
    if (typeof __firebase_config !== 'undefined' && key === '__firebase_config') return __firebase_config;
    // @ts-ignore
    if (typeof __initial_auth_token !== 'undefined' && key === '__initial_auth_token') return __initial_auth_token;
    return defaultVal;
};

const appId = getGlobal('__app_id', 'default-app-id');
const firebaseConfigStr = getGlobal('__firebase_config', '{}');
const firebaseConfig = JSON.parse(firebaseConfigStr);
const initialAuthToken = getGlobal('__initial_auth_token', null);

// Default Exchange Rates Configuration
const DEFAULT_EXCHANGE_RATES: Record<string, number> = {
    'USD': 42.43,
    'EUR': 49.19,
    'GRAM': 5680,
    'USDT': 42.43 
};

// Wallet Type Icons/Currency Map
const WALLET_TYPES: Record<string, { icon: any, currency: string }> = {
	'Nakit': { icon: Landmark, currency: 'TRY' },
	'Banka Hesabı': { icon: Landmark, currency: 'TRY' },
	'Kredi Kartı': { icon: CreditCard, currency: 'TRY' },
	'Vadeli Mevduat': { icon: Landmark, currency: 'TRY' },
	'Euro': { icon: DollarSign, currency: 'EUR' },
	'Altın': { icon: DollarSign, currency: 'GRAM' },
	'Dolar': { icon: DollarSign, currency: 'USD' },
	'Kripto': { icon: DollarSign, currency: 'USDT' },
};

// Default Category Types 
const DEFAULT_CATEGORIES = {
	income: [
		{ name: 'Maaş', id: 'default-salary', isDefault: true, type: 'income' },
		{ name: 'Serbest Çalışma', id: 'default-freelance', isDefault: true, type: 'income' },
		{ name: 'Kira Geliri', id: 'default-rent', isDefault: true, type: 'income' },
		{ name: 'Yatırım Getirisi', id: 'default-investment', isDefault: true, type: 'income' },
		{ name: 'Diğer Gelir', id: 'default-other-income', isDefault: true, type: 'income' },
	],
	expense: [
		{ name: 'Market Alışverişi', id: 'default-groceries', isDefault: true, type: 'expense' },
		{ name: 'Ulaşım', id: 'default-transport', isDefault: true, type: 'expense' },
		{ name: 'Fatura', id: 'default-bill', isDefault: true, type: 'expense' },
		{ name: 'Eğlence', id: 'default-entertainment', isDefault: true, type: 'expense' },
		{ name: 'Yemek/Restoran', id: 'default-dining', isDefault: true, type: 'expense' },
		{ name: 'Giyim', id: 'default-clothing', isDefault: true, type: 'expense' },
		{ name: 'Diğer Gider', id: 'default-other-expense', isDefault: true, type: 'expense' },
	],
};

// Function to format numbers as currency
const formatCurrency = (amount: number | string, currency = 'TRY') => {
	const num = typeof amount === 'number' ? amount : parseFloat(amount as string);
	if (isNaN(num)) return '0,00 TRY';
	
	let options: Intl.NumberFormatOptions = {
		style: 'currency',
		currency: 'TRY',
		minimumFractionDigits: 2,
		maximumFractionDigits: 2,
	};

	switch (currency) {
		case 'EUR':
			options.currency = 'EUR';
			break;
		case 'USD':
			options.currency = 'USD';
			break;
		case 'GRAM':
			return `${num.toLocaleString('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} gr`;
		case 'USDT':
			return `${num.toLocaleString('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} USDT`;
		default:
			options.currency = 'TRY';
			break;
	}

	return num.toLocaleString('tr-TR', options);
};

// Helper to convert date to YYYY-MM-DD
const formatDateInput = (date: any) => {
	if (!date) return '';
	const d = date instanceof Date ? date : new Date(date);
	const year = d.getFullYear();
	const month = String(d.getMonth() + 1).padStart(2, '0');
	const day = String(d.getDate()).padStart(2, '0');
	return `${year}-${month}-${day}`;
};

// --- Custom Modal/Action Menu Component ---
const ActionMenu = ({ title, children, onClose }: { title: string, children: React.ReactNode, onClose: () => void }) => (
	<div 
		className="fixed inset-0 bg-black bg-opacity-50 z-50 flex items-end justify-center"
		onClick={onClose} 
	>
		<div 
			className="bg-white dark:bg-gray-800 rounded-t-xl w-full max-w-lg shadow-2xl transform transition-transform duration-300"
			onClick={(e) => e.stopPropagation()} 
		>
			<div className="flex justify-between items-center p-4 border-b border-gray-100 dark:border-gray-700">
				<h3 className="text-xl font-bold text-gray-900 dark:text-white">{title}</h3>
				<button onClick={onClose} className="p-2 rounded-full hover:bg-gray-100 dark:hover:bg-gray-700">
					<X className="w-5 h-5 text-gray-600 dark:text-gray-300" />
				</button>
			</div>
			<div className="p-4 space-y-3 max-h-[70vh] overflow-y-auto">
				{children}
			</div>
		</div>
	</div>
);

// --- Action Menu Item Component ---
const ActionMenuItem = ({ icon: Icon, label, onClick, color = 'text-indigo-600', disabled = false }: any) => (
	<button
		onClick={disabled ? null : onClick} 
		className={`w-full flex items-center space-x-3 p-3 rounded-lg transition 
			${disabled 
				? 'opacity-50 cursor-not-allowed' 
				: 'hover:bg-gray-100 dark:hover:bg-gray-700'
			}`}
		disabled={disabled} 
	>
		<Icon className={`w-6 h-6 ${color}`} />
		<span className={`font-medium ${disabled ? 'text-gray-500 dark:text-gray-500' : 'text-gray-800 dark:text-gray-200'}`}>{label}</span>
	</button>
);


// Component: Wallet Card
const WalletCard = React.memo(({ wallet, onClick, isSelected = false, rates }: { wallet: WalletData, onClick: any, isSelected?: boolean, rates: Record<string, number> }) => {
	const { icon: Icon, currency } = WALLET_TYPES[wallet.type] || { icon: Wallet, currency: '' };
	
	const customColor = wallet.color || '#374151'; 
	const isNegative = (wallet.balance || 0) < 0;
	const backgroundColor = isNegative ? '#dc2626' : customColor; 

    // Currency Conversion Logic
    const walletCurrency = wallet.currency || currency;
    const balance = wallet.balance || 0;
    
    let displayMain = formatCurrency(balance, walletCurrency);
    let displaySub = null;

    // If wallet is not TRY, show TL value as primary, and original as secondary
    if (walletCurrency !== 'TRY' && rates[walletCurrency]) {
        const tlValue = balance * rates[walletCurrency];
        displayMain = formatCurrency(tlValue, 'TRY'); // Show TL equivalent big
        displaySub = formatCurrency(balance, walletCurrency); // Show original small
    }

	return (
		<button 
			onClick={() => onClick(wallet)}
			style={{ backgroundColor: backgroundColor }}
			className={`p-4 rounded-xl shadow-lg text-white flex flex-col justify-between h-40 transform hover:scale-[1.02] transition duration-300 w-full text-left
			${isSelected ? 'ring-4 ring-indigo-400 ring-offset-2' : ''}`}
			aria-label={`${wallet.name} Cüzdan Detayları`}
		>
			<div className="flex justify-between items-start w-full">
				<div className="flex flex-col">
					<Icon className="w-6 h-6 mb-1 opacity-80" />
					<h3 className="font-semibold text-xl truncate pr-2">{wallet.name}</h3>
				</div>
				<List className="w-5 h-5 opacity-70 flex-shrink-0" />
			</div>
			<div className="flex flex-col items-end">
				<span className="text-sm font-medium opacity-80">Bakiye</span>
				<span className="text-3xl font-bold tracking-tight break-all">
					{displayMain}
				</span>
                {displaySub && (
                    <span className="text-sm font-medium opacity-80 mt-1">
                        {displaySub}
                    </span>
                )}
			</div>
		</button>
	);
});

// Component: Transaction Item
const TransactionItem = React.memo(({ transaction, onClick }: { transaction: TransactionData, onClick: any }) => {
	const isIncome = transaction.type === 'income';
	const isExpense = transaction.type === 'expense';
	const isTransfer = transaction.type === 'transfer';

	let amountClass = isIncome ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-600 dark:text-rose-400';
	let sign = isIncome ? '+' : '-';
	let iconComponent = isIncome ? TrendingUp : TrendingDown;
	let displayCurrency = transaction.currency;

	let mainDescription;
	let subDescriptionLine;

	if (isTransfer) {
		amountClass = 'text-indigo-600 dark:text-indigo-400';
		sign = '';
		iconComponent = Repeat;
		displayCurrency = transaction.sourceCurrency;
		mainDescription = transaction.description || 'Para Transferi';
		subDescriptionLine = `${transaction.sourceWalletName} → ${transaction.targetWalletName}`;
	} else {
		mainDescription = transaction.categoryName || (isIncome ? 'Gelir' : 'Gider');
		subDescriptionLine = transaction.walletName;
	}

	return (
		<button 
			onClick={() => onClick(transaction)}
			className="w-full flex justify-between items-center p-3 border-b border-gray-100 dark:border-gray-700 bg-white dark:bg-gray-800 hover:bg-gray-50 dark:hover:bg-gray-700 transition duration-150 rounded-lg mb-1 text-left"
		>
			<div className="flex items-center space-x-3 w-full min-w-0">
				<div className={`p-2 rounded-full flex-shrink-0 ${isTransfer ? 'bg-indigo-100 dark:bg-indigo-900' : (isIncome ? 'bg-emerald-100 dark:bg-emerald-900' : 'bg-rose-100 dark:bg-rose-900')}`}>
					{React.createElement(iconComponent, { className: `w-5 h-5 ${isTransfer ? 'text-indigo-600' : (isIncome ? 'text-emerald-600' : 'text-rose-600')}` })}
				</div>
				<div className="flex flex-col min-w-0 flex-grow">
					<p className="font-medium truncate text-gray-900 dark:text-white">{mainDescription}</p>
					<p className="text-xs text-gray-500 dark:text-gray-400 truncate">
						{subDescriptionLine} 
						{transaction.description && !isTransfer ? ` - (${transaction.description})` : ''} 
						{` - ${formatDateInput(transaction.date)}`}
					</p>
				</div>
			</div>
			<div className="flex flex-shrink-0 items-center ml-4">
				<span className={`font-semibold text-lg ${amountClass}`}>
					{sign}{formatCurrency(transaction.amount, displayCurrency)}
				</span>
			</div>
		</button>
	);
});


// --- UI Component: TransactionsList ---
const TransactionsList = React.memo(({ transactions, wallets, onEdit, filteredWalletId, onClearFilter }: any) => {
    const currentTransactions = useMemo(() => {
        if (filteredWalletId === 'all' || !filteredWalletId) {
            return transactions;
        }
        return transactions.filter((t: TransactionData) => 
            t.walletId === filteredWalletId || 
            t.sourceWalletId === filteredWalletId || 
            t.targetWalletId === filteredWalletId
        );
    }, [transactions, filteredWalletId]);

    const filterWallet = wallets.find((w: WalletData) => w.id === filteredWalletId);
    const filterName = filterWallet ? filterWallet.name : 'Tüm İşlemler';

    const WalletIcon = filterWallet ? (WALLET_TYPES[filterWallet.type]?.icon || Wallet) : List;
    
    return (
        <div className="space-y-4">
            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center p-4 bg-indigo-50 dark:bg-gray-700 rounded-xl shadow-md border-b border-indigo-200 dark:border-gray-600">
                <div className="flex items-center space-x-2">
                    <WalletIcon className="w-5 h-5 text-indigo-600 dark:text-indigo-400"/>
                    <h2 className="text-xl font-bold text-indigo-800 dark:text-white">
                        {filterName} İşlemleri
                    </h2>
                    <span className="text-sm text-indigo-600 dark:text-gray-300 hidden sm:inline-block">
                        ({currentTransactions.length} Kayıt)
                    </span>
                </div>
                {filteredWalletId !== 'all' && (
                    <button 
                        onClick={onClearFilter} 
                        className="text-sm font-medium text-red-600 hover:text-red-800 p-2 rounded-lg hover:bg-red-100 transition mt-2 sm:mt-0"
                    >
                        <X className="w-4 h-4 inline-block mr-1" /> Filtreyi Temizle
                    </button>
                )}
            </div>

            {currentTransactions.length > 0 ? (
                currentTransactions.map((tx: TransactionData) => (
                    <TransactionItem 
                        key={tx.id} 
                        transaction={tx} 
                        onClick={onEdit} 
                    />
                ))
            ) : (
                <div className="p-8 text-center bg-gray-50 dark:bg-gray-700 rounded-lg">
                    <AlertTriangle className="w-10 h-10 text-yellow-500 mx-auto mb-2" />
                    <p className="text-gray-600 dark:text-gray-300">Bu cüzdana ait herhangi bir işlem bulunmamaktadır.</p>
                </div>
            )}
        </div>
    );
});


// Main App Component
const App = () => {
	const [db, setDb] = useState<any>(null);
	const [userId, setUserId] = useState<string | null>(null);
	const [loading, setLoading] = useState(true);
	const [wallets, setWallets] = useState<WalletData[]>([]);
	const [transactions, setTransactions] = useState<TransactionData[]>([]);
	const [categories, setCategories] = useState<{income: any[], expense: any[]}>({ 
        income: [...DEFAULT_CATEGORIES.income], 
        expense: [...DEFAULT_CATEGORIES.expense] 
    });
    // Exchange Rates State
    const [exchangeRates, setExchangeRates] = useState<Record<string, number>>(() => {
        if (typeof window !== 'undefined') {
            const saved = localStorage.getItem('finata_rates');
            return saved ? JSON.parse(saved) : DEFAULT_EXCHANGE_RATES;
        }
        return DEFAULT_EXCHANGE_RATES;
    });

	const [view, setView] = useState('dashboard');
	const [editWallet, setEditWallet] = useState<WalletData | null>(null);
	const [editTransaction, setEditTransaction] = useState<any>(null);
	const [editCategory, setEditCategory] = useState<CategoryData | null>(null);
	const [transactionType, setTransactionType] = useState<string | null>('expense');
	const [error, setError] = useState<string | null>(null);
	const [selectedTransaction, setSelectedTransaction] = useState<TransactionData | null>(null);
	const [selectedWallet, setSelectedWallet] = useState<WalletData | null>(null);
	const [isTransferMode, setIsTransferMode] = useState(false);
    const [filteredWalletId, setFilteredWalletId] = useState('all'); 
    const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);

	// --- Firebase Initialization and Auth ---
	useEffect(() => {
		try {
			if (Object.keys(firebaseConfig).length === 0) {
				console.warn("Firebase config is empty. Initializing in DEMO MODE (Local Only).");
				setLoading(false);
                setUserId('demo-user');
                // Do not return error, proceed in Demo Mode (db stays null)
				return;
			}
			
			const app = initializeApp(firebaseConfig);
			const firestore = getFirestore(app);
			const authInstance = getAuth(app);
			setDb(firestore);

			onAuthStateChanged(authInstance, async (user) => {
				if (user) {
					setUserId(user.uid);
				} else {
					try {
						if (initialAuthToken) {
							await signInWithCustomToken(authInstance, initialAuthToken);
						} else {
							await signInAnonymously(authInstance);
						}
					} catch (e) {
						console.error("Authentication failed:", e);
						setError("Kullanıcı girişi yapılamadı. Veriler kaydedilemeyecek.");
					}
				}
				setLoading(false);
			});
		} catch (e) {
			console.error("Firebase initialization failed:", e);
            // Fallback to Demo Mode on init fail
            console.warn("Falling back to Demo Mode due to initialization failure.");
            setUserId('demo-user');
			setLoading(false);
		}
	}, []);

	// --- Firestore Listeners ---
	useEffect(() => {
		if (!db || !userId) return;

		const walletsRef = collection(db, `artifacts/${appId}/users/${userId}/wallets`);
		const transactionsRef = collection(db, `artifacts/${appId}/users/${userId}/transactions`);
		const categoriesRef = collection(db, `artifacts/${appId}/users/${userId}/categories`);

		const unsubscribeWallets = onSnapshot(walletsRef, (snapshot: QuerySnapshot<DocumentData>) => {
			const walletsData = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })) as WalletData[];
			setWallets(walletsData);
		}, (e) => console.error("Wallets snapshot error:", e));

		const unsubscribeTransactions = onSnapshot(transactionsRef, (snapshot: QuerySnapshot<DocumentData>) => {
			const transactionsData = snapshot.docs.map(doc => ({ 
				id: doc.id, 
				...doc.data(), 
				date: doc.data().date && typeof doc.data().date.toDate === 'function' 
					? doc.data().date.toDate() 
					: new Date()
			})) as TransactionData[];
			setTransactions(transactionsData.sort((a, b) => b.date.getTime() - a.date.getTime()));
		}, (e) => console.error("Transactions snapshot error:", e));

		const unsubscribeCategories = onSnapshot(categoriesRef, (snapshot: QuerySnapshot<DocumentData>) => {
				const userCategories = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data(), isDefault: false }));
				setCategories({
						income: [...DEFAULT_CATEGORIES.income, ...userCategories.filter((c: any) => c.type === 'income')],
						expense: [...DEFAULT_CATEGORIES.expense, ...userCategories.filter((c: any) => c.type === 'expense')],
				});
		}, (e) => console.error("Categories snapshot error:", e));

		return () => {
			unsubscribeWallets();
			unsubscribeTransactions();
			unsubscribeCategories();
		};
	}, [db, userId]);

    // Save rates to local storage when changed
    useEffect(() => {
        localStorage.setItem('finata_rates', JSON.stringify(exchangeRates));
    }, [exchangeRates]);

	// --- Data Calculations (Memoized) ---
	const { totalBalance, totalIncome, totalExpense } = useMemo(() => {
		const balance = wallets.reduce((acc, wallet) => {
			const currency = wallet.currency || WALLET_TYPES[wallet.type]?.currency || 'TRY';
            const amount = wallet.balance || 0;
            
			if (currency === 'TRY') {
				return acc + amount;
			} else if (exchangeRates[currency]) {
                return acc + (amount * exchangeRates[currency]);
            }
			return acc;
		}, 0);

		const income = transactions.filter(t => t.type === 'income').reduce((sum, t) => sum + (t.amount || 0), 0);
		const expense = transactions.filter(t => t.type === 'expense').reduce((sum, t) => sum + (t.amount || 0), 0);
		
		return { totalBalance: balance, totalIncome: income, totalExpense: expense };
	}, [wallets, transactions, exchangeRates]);

	const netWorth = totalBalance;
	
	// --- Core Utility Functions ---

	const handleWalletAction = (wallet: WalletData) => {
		setSelectedWallet(wallet);
	};
	
	const handleTransactionAction = (transaction: TransactionData) => {
		setSelectedTransaction(transaction);
	};

    const handleViewWalletTransactions = (walletId: string) => {
        setFilteredWalletId(walletId);
        setSelectedWallet(null);
        setView('transactions');
        setIsMobileMenuOpen(false);
    };

    const handleRateChange = (currency: string, value: string) => {
        const numVal = parseFloat(value);
        if (!isNaN(numVal)) {
            setExchangeRates(prev => ({ ...prev, [currency]: numVal }));
        }
    };

    const resetRates = () => {
        setExchangeRates(DEFAULT_EXCHANGE_RATES);
    };

	const startTransactionFlow = (type: string, walletId: string | null = null) => {
		setSelectedWallet(null);
		setSelectedTransaction(null);
		setEditTransaction(null);
		setIsTransferMode(false);
		setTransactionType(type);
		setIsMobileMenuOpen(false);
		
		const defaultCategory = categories[type as 'income'|'expense'] && categories[type as 'income'|'expense'].length > 0 ? categories[type as 'income'|'expense'][0].id : '';
		
		setEditTransaction({ 
			walletId, 
			type, 
			categoryId: defaultCategory,
			amount: ''
		});

		setView('add-transaction');
	};

	const startTransferFlow = (sourceWalletId: string | null = null) => {
		setSelectedWallet(null);
		setSelectedTransaction(null);
		setEditTransaction(null);
		setIsTransferMode(true);
		setIsMobileMenuOpen(false);
		
		if (sourceWalletId) {
			setEditTransaction({ sourceWalletId });
		}
		setView('add-transaction');
	};

	const startEditWallet = (wallet: WalletData) => {
		setSelectedWallet(null);
		setEditWallet(wallet);
		setView('add-wallet');
		setIsMobileMenuOpen(false);
	}
	
	const startEditCategory = (category: CategoryData) => {
		setEditCategory(category);
		setView('categories');
		setIsMobileMenuOpen(false);
	}

	// --- Firestore Data Operations ---

	const handleSaveWallet = async (walletData: any, isEdit: boolean) => {
        const typeInfo = WALLET_TYPES[walletData.type] || { currency: 'TRY' } as any;
        const dataToSave = {
			name: walletData.name,
			type: walletData.type,
			currency: typeInfo.currency || 'TRY',
			balance: walletData.balance || 0,	
			color: walletData.color,
			createdAt: new Date(),
		};

        // --- Demo Mode Logic ---
        if (!db) {
            if (isEdit && editWallet) {
                setWallets(prev => prev.map(w => w.id === editWallet.id ? { ...w, ...dataToSave, balance: w.balance } : w));
            } else {
                setWallets(prev => [...prev, { id: crypto.randomUUID(), ...dataToSave } as WalletData]);
            }
            setEditWallet(null);
            setView('wallets');
            return;
        }
        // --- End Demo Mode ---

		if (!userId) return;

		const walletRef = collection(db, `artifacts/${appId}/users/${userId}/wallets`);
		try {
			if (isEdit && editWallet) {
				await updateDoc(doc(walletRef, editWallet.id), {
					name: dataToSave.name,
					type: dataToSave.type,
					currency: dataToSave.currency,
					color: dataToSave.color,
				});
			} else {
				await setDoc(doc(walletRef, crypto.randomUUID()), dataToSave);
			}
			setEditWallet(null);
			setView('wallets');
		} catch (e) {
			console.error("Cüzdan kaydetme hatası:", e);
			setError("Cüzdan kaydedilirken bir hata oluştu.");
		}
	};

	const handleDeleteWallet = async (walletId: string) => {
        // --- Demo Mode Logic ---
        if (!db) {
            setWallets(prev => prev.filter(w => w.id !== walletId));
            setEditWallet(null);
			setSelectedWallet(null);
			setView('wallets');
            return;
        }
        // --- End Demo Mode ---

		if (!userId) return;
		try {
			const walletRef = doc(db, `artifacts/${appId}/users/${userId}/wallets`, walletId);
			await deleteDoc(walletRef);
			setEditWallet(null);
			setSelectedWallet(null);
			setView('wallets');
		} catch (e: any) {
			console.error("Cüzdan silme hatası:", e);
			setError(`Cüzdan silinirken bir hata oluştu: ${e.message}`);
		}
	};

	const handleSaveCategory = async (categoryData: any, isEdit: boolean) => {
        const dataToSave = {
			name: categoryData.name,
			type: categoryData.type,	
			createdAt: new Date(),
		};

        // --- Demo Mode Logic ---
        if (!db) {
            const newCat = { id: isEdit && editCategory ? editCategory.id : crypto.randomUUID(), ...dataToSave, isDefault: false };
            setCategories(prev => {
                const list = prev[categoryData.type as 'income' | 'expense'];
                if (isEdit) {
                    const updatedList = list.map((c: any) => c.id === newCat.id ? newCat : c);
                    return { ...prev, [categoryData.type]: updatedList };
                } else {
                    return { ...prev, [categoryData.type]: [...list, newCat] };
                }
            });
            setEditCategory(null);
            return;
        }
        // --- End Demo Mode ---

		if (!userId) return;

		const categoriesRef = collection(db, `artifacts/${appId}/users/${userId}/categories`);
		try {
			if (isEdit && editCategory) {
				await updateDoc(doc(categoriesRef, editCategory.id), {
					name: dataToSave.name,
					type: dataToSave.type,
				});
			} else {
				await setDoc(doc(categoriesRef, crypto.randomUUID()), dataToSave);
			}
			setEditCategory(null);
		} catch (e) {
			console.error("Kategori kaydetme hatası:", e);
			setError("Kategori kaydedilirken bir hata oluştu.");
		}
	};

	const handleDeleteCategory = async (categoryId: string) => {
        // --- Demo Mode Logic ---
        if (!db) {
            setCategories(prev => {
                // Try to remove from both, though ID is unique
                return {
                    income: prev.income.filter((c:any) => c.id !== categoryId),
                    expense: prev.expense.filter((c:any) => c.id !== categoryId)
                };
            });
            setEditCategory(null);
            return;
        }
        // --- End Demo Mode ---

		if (!userId) return;
		try {
			const categoryRef = doc(db, `artifacts/${appId}/users/${userId}/categories`, categoryId);
			await deleteDoc(categoryRef);
			setEditCategory(null);
		} catch (e: any) {
			console.error("Kategori silme hatası:", e);
			setError(`Kategori silinirken bir hata oluştu: ${e.message}`);
		}
	};

	const handleSaveTransaction = async (transactionData: any, isEdit: boolean) => {
        const categoryList = categories[transactionData.type as 'income'|'expense'] || [];
		const category = categoryList.find((c: any) => c.id === transactionData.categoryId);

		if (!category) {
			setError("İşlem kaydedilemedi: Geçerli bir kategori seçilmelidir.");
			return;
		}
		
		const wallet = wallets.find(w => w.id === transactionData.walletId);
		if (!wallet) {
			setError("İşlem kaydedilemedi: Cüzdan bulunamadı.");
			return;
		}
		
		let previousBalanceChange = 0;
		if (isEdit && editTransaction && editTransaction.type !== 'transfer') {
			const oldAmount = editTransaction.amount;
			const oldType = editTransaction.type;
			if (oldType === 'income') previousBalanceChange = -oldAmount;
			else if (oldType === 'expense') previousBalanceChange = oldAmount;
		}
		
		const newAmountValue = parseFloat(transactionData.amount);
		let newBalanceChange = 0;
		const newType = transactionData.type;

		if (newType === 'expense') newBalanceChange = -newAmountValue;
		else if (newType === 'income') newBalanceChange = newAmountValue;
		
		const finalBalanceChange = newBalanceChange + previousBalanceChange;

        const txObject = {
            walletId: transactionData.walletId,
            walletName: wallet.name,
            currency: wallet.currency,
            type: newType,
            amount: newAmountValue,
            categoryId: category.id,	
            categoryName: category.name,	
            description: transactionData.description || '',	
            date: transactionData.date ? new Date(transactionData.date) : new Date(),
            createdAt: new Date(),
        };

        // --- Demo Mode Logic ---
        if (!db) {
            setWallets(prev => prev.map(w => {
                if (w.id === transactionData.walletId) {
                    return { ...w, balance: w.balance + finalBalanceChange };
                }
                return w;
            }));

            if (isEdit && editTransaction && editTransaction.id) {
                setTransactions(prev => prev.map(t => t.id === editTransaction.id ? { ...t, ...txObject, id: t.id } as TransactionData : t));
            } else {
                setTransactions(prev => [{ ...txObject, id: crypto.randomUUID() } as TransactionData, ...prev]);
            }

            setEditTransaction(null);
			setSelectedTransaction(null);
			setView('transactions');
            return;
        }
        // --- End Demo Mode ---

		if (!userId) return;

		const transactionRef = collection(db, `artifacts/${appId}/users/${userId}/transactions`);
		const walletRef = doc(db, `artifacts/${appId}/users/${userId}/wallets`, transactionData.walletId);
		
		try {
			await runTransaction(db, async (t) => {
				const walletDoc = await t.get(walletRef);
				if (!walletDoc.exists()) {
					throw new Error("Cüzdan mevcut değil!");
				}
				
				const currentBalance = (walletDoc.data() as any)?.balance || 0;
				const newBalance = currentBalance + finalBalanceChange;
				
				t.update(walletRef, { balance: newBalance });

				if (isEdit && editTransaction && editTransaction.id) {
					t.update(doc(transactionRef, editTransaction.id), txObject);
				} else {
					t.set(doc(transactionRef, crypto.randomUUID()), txObject);
				}
			});

			setEditTransaction(null);
			setSelectedTransaction(null);
			setView('transactions');
		} catch (e: any) {
			console.error("İşlem kaydetme/düzenleme hatası:", e);
			setError(`İşlem kaydedilirken hata oluştu: ${e.message}`);
		}
	};

	const handleSaveTransfer = async (transferData: any) => {
		const isEdit = !!editTransaction && editTransaction.type === 'transfer';
		const sourceId = isEdit ? editTransaction.sourceWalletId : transferData.sourceWalletId;
		const targetId = isEdit ? editTransaction.targetWalletId : transferData.targetWalletId;

		if (sourceId === targetId) {
			setError("Kaynak ve Hedef Cüzdan aynı olamaz.");
			return;
		}
		
		const sourceWallet = wallets.find(w => w.id === sourceId);
		const targetWallet = wallets.find(w => w.id === targetId);

		if (!sourceWallet || !targetWallet) {
				setError("Kaynak veya hedef cüzdan bulunamadı.");
				return;
		}

		const amount = parseFloat(transferData.amount);

		let previousAmount = 0;
		if (isEdit) {
				previousAmount = editTransaction.amount || 0;
		}

		const finalSourceChange = previousAmount - amount;
		const finalTargetChange = amount - previousAmount;

        const baseTxData = {
            amount,
            date: transferData.date ? new Date(transferData.date) : new Date(),
            description: transferData.description || 'Para Transferi',	
            createdAt: new Date(),
            type: 'transfer' as 'transfer',	
            sourceWalletId: sourceWallet.id,
            sourceWalletName: sourceWallet.name,
            sourceCurrency: sourceWallet.currency,
            targetWalletId: targetWallet.id,
            targetWalletName: targetWallet.name,
            targetCurrency: targetWallet.currency,
        };

        // --- Demo Mode Logic ---
        if (!db) {
            setWallets(prev => prev.map(w => {
                if (w.id === sourceId) return { ...w, balance: w.balance + finalSourceChange };
                if (w.id === targetId) return { ...w, balance: w.balance + finalTargetChange };
                return w;
            }));

            if (isEdit && editTransaction.id) {
                setTransactions(prev => prev.map(t => t.id === editTransaction.id ? { ...t, ...baseTxData, id: t.id } as TransactionData : t));
            } else {
                setTransactions(prev => [{ ...baseTxData, id: crypto.randomUUID() } as TransactionData, ...prev]);
            }

            setEditTransaction(null);
			setIsTransferMode(false);
			setView('transactions');
            return;
        }
        // --- End Demo Mode ---

		if (!userId) return;

		const transactionRef = collection(db, `artifacts/${appId}/users/${userId}/transactions`);
        const sourceWalletRef = doc(db, `artifacts/${appId}/users/${userId}/wallets`, sourceId);
		const targetWalletRef = doc(db, `artifacts/${appId}/users/${userId}/wallets`, targetId);

		try {
			await runTransaction(db, async (t) => {
				const sourceDoc = await t.get(sourceWalletRef);
				const targetDoc = await t.get(targetWalletRef);
				
				if (!sourceDoc.exists() || !targetDoc.exists()) {
					throw new Error("Cüzdanlar mevcut değil!");
				}
				
				const sourceBalance = (sourceDoc.data() as any)?.balance || 0;
				const targetBalance = (targetDoc.data() as any)?.balance || 0;

				const newSourceBalance = sourceBalance + finalSourceChange;
				const newTargetBalance = targetBalance + finalTargetChange;

				t.update(sourceWalletRef, { balance: newSourceBalance });
				t.update(targetWalletRef, { balance: newTargetBalance });
				
				if (isEdit && editTransaction.id) {
						t.update(doc(transactionRef, editTransaction.id), baseTxData);
				} else {
						t.set(doc(transactionRef, crypto.randomUUID()), baseTxData);
				}
			});

			setEditTransaction(null);
			setIsTransferMode(false);
			setView('transactions');
		} catch (e: any) {
			console.error("Transfer kaydetme hatası:", e);
			setError(`Transfer kaydedilirken hata oluştu: ${e.message}`);
		}
	};

	const handleDeleteTransaction = async (transaction: TransactionData) => {
        let balanceUpdates: {id: string, change: number}[] = [];
		
		if (transaction.type === 'transfer') {
            // Reversing a transfer: Add back to source, Remove from target
            balanceUpdates.push({ id: transaction.sourceWalletId!, change: transaction.amount });
            balanceUpdates.push({ id: transaction.targetWalletId!, change: -transaction.amount });
		} else {
            let amountToReverse = 0;
            // Income was +amount, so reverse is -amount
            if (transaction.type === 'income') amountToReverse = -transaction.amount;
            // Expense was -amount, so reverse is +amount
            else if (transaction.type === 'expense') amountToReverse = transaction.amount;
            
            balanceUpdates.push({ id: transaction.walletId!, change: amountToReverse });
		}

        // --- Demo Mode Logic ---
        if (!db) {
            setWallets(prev => prev.map(w => {
                const update = balanceUpdates.find(u => u.id === w.id);
                if (update) {
                    return { ...w, balance: w.balance + update.change };
                }
                return w;
            }));
            setTransactions(prev => prev.filter(t => t.id !== transaction.id));
            setSelectedTransaction(null);
			setView('transactions');
            return;
        }
        // --- End Demo Mode ---

		if (!userId) return;

		const transactionRef = doc(db, `artifacts/${appId}/users/${userId}/transactions`, transaction.id);
		
		try {
			await runTransaction(db, async (t) => {
				for (const update of balanceUpdates) {
                    const walletRef = doc(db, `artifacts/${appId}/users/${userId}/wallets`, update.id);
                    const walletDoc = await t.get(walletRef);
                    if (!walletDoc.exists()) continue;
                    const currentBalance = (walletDoc.data() as any)?.balance || 0;
                    t.update(walletRef, { balance: currentBalance + update.change });
				}
				
				t.delete(transactionRef);
			});
			setSelectedTransaction(null);
			setView('transactions');
		} catch (e: any) {
			console.error("İşlem silme hatası:", e);
			setError(`İşlem silinirken hata oluştu: ${e.message}`);
		}
	};
	
	const handleCopyTransaction = (transaction: TransactionData) => {
		const isOriginalTransfer = transaction.type === 'transfer';
		
		if (isOriginalTransfer) {
				setEditTransaction({
						amount: transaction.amount,
						description: transaction.description,	
						sourceWalletId: transaction.sourceWalletId,
						targetWalletId: transaction.targetWalletId,
						date: formatDateInput(new Date()),
						type: 'transfer' 
				});
				setIsTransferMode(true);
				setTransactionType(null);
		} else {
				const copiedTx = {
						id: undefined,	
						type: transaction.type,
						description: transaction.description,	
						categoryId: transaction.categoryId,	
						date: formatDateInput(new Date()),
						walletId: transaction.walletId,
						amount: transaction.amount.toString(),
				};
				setEditTransaction(copiedTx);	
				setTransactionType(transaction.type);	
				setIsTransferMode(false);	
		}
		
		setSelectedTransaction(null);
		setView('add-transaction');
	};

	// --- UI Components: Forms ---

	const WalletForm = () => {	
		const isEdit = !!editWallet;
		const [name, setName] = useState(editWallet?.name || '');
		const [type, setType] = useState(editWallet?.type || Object.keys(WALLET_TYPES)[0]);
		const [color, setColor] = useState(editWallet?.color || '#374151');	
		const [balance, setBalance] = useState(isEdit ? 0 : 0);
		
		const currentCurrency = WALLET_TYPES[type]?.currency || 'TRY';

		const handleSubmit = (e: React.FormEvent) => {
			e.preventDefault();
			
			const numBalance = isEdit && editWallet ? editWallet.balance : parseFloat(balance as unknown as string);
			if (!name || !type || (isEdit && editWallet ? isNaN(editWallet.balance) : isNaN(numBalance))) {
				setError("Lütfen tüm alanları doldurun ve geçerli bakiye girin.");
				return;
			}
			handleSaveWallet({ name, type, color, balance: numBalance }, isEdit);
		};

		return (
			<div className="p-4 bg-white dark:bg-gray-800 rounded-xl shadow-2xl max-w-lg mx-auto">
				<h2 className="text-2xl font-bold mb-6 text-gray-900 dark:text-white">{isEdit ? 'Cüzdanı Düzenle' : 'Yeni Cüzdan Ekle'}</h2>
				<form onSubmit={handleSubmit} className="space-y-4">
					<div>
						<label htmlFor="name" className="block text-sm font-medium text-gray-700 dark:text-gray-300">Hesap Adı</label>
						<input
							type="text"
							id="name"
							value={name}
							onChange={(e) => setName(e.target.value)}
							className="mt-1 block w-full rounded-lg border-gray-300 dark:border-gray-600 dark:bg-gray-700 dark:text-white p-3 shadow-sm focus:ring-indigo-500 focus:border-indigo-500"
							required
						/>
					</div>
					<div>
						<label htmlFor="type" className="block text-sm font-medium text-gray-700 dark:text-gray-300">Hesap Tipi</label>
						<select
							id="type"
							value={type}
							onChange={(e) => setType(e.target.value)}
							className="mt-1 block w-full rounded-lg border-gray-300 dark:border-gray-600 dark:bg-gray-700 dark:text-white p-3 shadow-sm focus:ring-indigo-500 focus:border-indigo-500"
							required
						>
							{Object.keys(WALLET_TYPES).map(t => (
								<option key={t} value={t}>{t} ({WALLET_TYPES[t].currency})</option>
							))}
						</select>
					</div>

					<div>
						<label htmlFor="color" className="block text-sm font-medium text-gray-700 dark:text-gray-300">Kart Rengi</label>
						<input
							type="color"
							id="color"
							value={color}
							onChange={(e) => setColor(e.target.value)}
							className="mt-1 block w-full h-10 rounded-lg border-gray-300 dark:border-gray-600 dark:bg-gray-700 p-1 shadow-sm"
							required
						/>
					</div>
					
					{!isEdit && (
						<div>
							<label htmlFor="balance" className="block text-sm font-medium text-gray-700 dark:text-gray-300">Başlangıç Bakiyesi ({currentCurrency})</label>
							<input
								type="number"
								id="balance"
								value={balance}
								onChange={(e) => setBalance(parseFloat(e.target.value))}
								className="mt-1 block w-full rounded-lg border-gray-300 dark:border-gray-600 dark:bg-gray-700 dark:text-white p-3 shadow-sm focus:ring-indigo-500 focus:border-indigo-500"
								step="0.01"
								placeholder="0.00"
								required
							/>
							<p className="text-xs text-gray-500 dark:text-gray-400 mt-1">Sadece yeni cüzdanlar için başlangıç bakiyesi ayarlanabilir.</p>
						</div>
					)}
					
					<button
						type="submit"
						className="w-full bg-indigo-600 text-white p-3 rounded-lg font-semibold hover:bg-indigo-700 transition duration-150 shadow-md"
					>
						{isEdit ? 'Cüzdanı Güncelle' : 'Cüzdanı Ekle'}
					</button>
					
					{isEdit && editWallet && (
						<button
							type="button"
							onClick={() => handleDeleteWallet(editWallet.id)}
							className="w-full bg-red-600 text-white p-3 rounded-lg font-semibold hover:bg-red-700 transition duration-150 shadow-md mt-2"
						>
							Cüzdanı Sil
						</button>
					)}
				</form>
				<button
					onClick={() => { setEditWallet(null); setView('wallets'); }}
					className="w-full text-gray-600 dark:text-gray-400 p-3 mt-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 transition"
				>
					İptal
				</button>
			</div>
		);
	};

	const TransactionForm = ({ wallets, categories, isTransferMode, setIsTransferMode }: any) => {
		const isEdit = !!editTransaction && !!editTransaction.id && editTransaction.type !== 'transfer';
		const isEditTransfer = !!editTransaction && !!editTransaction.id && editTransaction.type === 'transfer';
		
		const initialTx = editTransaction || {};

		const [amount, setAmount] = useState(initialTx.amount?.toString() || '');
		const [description, setDescription] = useState(initialTx.description || '');
		const [date, setDate] = useState(formatDateInput(initialTx.date) || formatDateInput(new Date()));
		const [walletId, setWalletId] = useState(initialTx.walletId || (wallets.length > 0 ? wallets[0].id : ''));
		const [categoryId, setCategoryId] = useState(initialTx.categoryId || '');
		
		const [sourceWalletId, setSourceWalletId] = useState(initialTx.sourceWalletId || (wallets.length > 0 ? wallets[0].id : ''));
		const [targetWalletId, setTargetWalletId] = useState(initialTx.targetWalletId || (wallets.length > 1 ? wallets[1].id : ''));
		
		const currentType = initialTx.type || transactionType;
		const walletOptions = wallets.filter((w: WalletData) => w.id !== 'all');

		useEffect(() => {
			if (!categoryId && currentType && categories[currentType] && categories[currentType].length > 0) {
				setCategoryId(categories[currentType][0].id);
			}
		}, [categoryId, currentType, categories]);

		const handleSubmit = (e: React.FormEvent) => {
			e.preventDefault();
			const parsedAmount = parseFloat(amount);
			
			if (isNaN(parsedAmount) || parsedAmount <= 0 || !date) {
				setError("Geçerli bir tutar ve tarih girin.");
				return;
			}

			if (isTransferMode || isEditTransfer) {
				if (sourceWalletId === targetWalletId) {
					setError("Kaynak ve Hedef Cüzdan aynı olamaz.");
					return;
				}
				handleSaveTransfer({ amount: parsedAmount, sourceWalletId, targetWalletId, description, date });
			} else {
				if (!walletId || !categoryId) {
					setError("Cüzdan ve kategori seçimi zorunludur.");
					return;
				}
				handleSaveTransaction({ amount: parsedAmount, type: currentType, walletId, categoryId, description, date }, isEdit);
			}
		};

		const categoryOptions = categories[currentType] || [];
		const sourceCurrency = wallets.find((w: WalletData) => w.id === sourceWalletId)?.currency || 'TRY';

		return (
			<div className="p-4 bg-white dark:bg-gray-800 rounded-xl shadow-2xl max-w-lg mx-auto">
				<div className="flex justify-between items-center mb-6">
					<h2 className="text-2xl font-bold text-gray-900 dark:text-white">
						{isTransferMode || isEditTransfer ? 'Para Transferi' : 
						(isEdit ? 'İşlemi Düzenle' : (currentType === 'income' ? 'Yeni Gelir' : 'Yeni Gider'))}
					</h2>
					<button onClick={() => { setIsTransferMode((prev: boolean) => !prev); setEditTransaction(null); }} className="text-indigo-600 dark:text-indigo-400 font-medium text-sm hover:underline">
						{isTransferMode || isEditTransfer ? 'Gider/Gelir Ekle' : 'Transfer Ekle'}
					</button>
				</div>

				<form onSubmit={handleSubmit} className="space-y-4">
					
					<div className="grid grid-cols-2 gap-4">
						<div>
							<label htmlFor="amount" className="block text-sm font-medium text-gray-700 dark:text-gray-300">
								Tutar ({isTransferMode || isEditTransfer ? sourceCurrency : (wallets.find((w: WalletData) => w.id === walletId)?.currency || 'TRY')})
							</label>
							<input
								type="number"
								id="amount"
								value={amount}
								onChange={(e) => setAmount(e.target.value)}
								className="mt-1 block w-full rounded-lg border-gray-300 dark:border-gray-600 dark:bg-gray-700 dark:text-white p-3 shadow-sm focus:ring-indigo-500 focus:border-indigo-500"
								step="0.01"
								placeholder="0.00"
								required
							/>
						</div>
						<div>
							<label htmlFor="date" className="block text-sm font-medium text-gray-700 dark:text-gray-300">Tarih</label>
							<input
								type="date"
								id="date"
								value={date}
								onChange={(e) => setDate(e.target.value)}
								className="mt-1 block w-full rounded-lg border-gray-300 dark:border-gray-600 dark:bg-gray-700 dark:text-white p-3 shadow-sm focus:ring-indigo-500 focus:border-indigo-500"
								required
							/>
						</div>
					</div>

					{(isTransferMode || isEditTransfer) ? (
						<div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
							<div>
								<label htmlFor="sourceWallet" className="block text-sm font-medium text-gray-700 dark:text-gray-300">Kaynak Cüzdan</label>
								<select
									id="sourceWallet"
									value={sourceWalletId}
									onChange={(e) => setSourceWalletId(e.target.value)}
									className="mt-1 block w-full rounded-lg border-gray-300 dark:border-gray-600 dark:bg-gray-700 dark:text-white p-3 shadow-sm focus:ring-indigo-500 focus:border-indigo-500"
									required
									disabled={isEditTransfer}
								>
									{walletOptions.map((w: WalletData) => (
										<option key={w.id} value={w.id}>{w.name} ({w.currency})</option>
									))}
								</select>
							</div>
							<div>
								<label htmlFor="targetWallet" className="block text-sm font-medium text-gray-700 dark:text-gray-300">Hedef Cüzdan</label>
								<select
									id="targetWallet"
									value={targetWalletId}
									onChange={(e) => setTargetWalletId(e.target.value)}
									className="mt-1 block w-full rounded-lg border-gray-300 dark:border-gray-600 dark:bg-gray-700 dark:text-white p-3 shadow-sm focus:ring-indigo-500 focus:border-indigo-500"
									required
									disabled={isEditTransfer}
								>
									{walletOptions.map((w: WalletData) => (
										<option key={w.id} value={w.id}>{w.name} ({w.currency})</option>
									))}
								</select>
							</div>
						</div>
					) : (
						<div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
							<div>
								<label htmlFor="wallet" className="block text-sm font-medium text-gray-700 dark:text-gray-300">Cüzdan</label>
								<select
									id="wallet"
									value={walletId}
									onChange={(e) => setWalletId(e.target.value)}
									className="mt-1 block w-full rounded-lg border-gray-300 dark:border-gray-600 dark:bg-gray-700 dark:text-white p-3 shadow-sm focus:ring-indigo-500 focus:border-indigo-500"
									required
								>
									{walletOptions.map((w: WalletData) => (
										<option key={w.id} value={w.id}>{w.name} ({w.currency})</option>
									))}
								</select>
							</div>
							<div>
								<label htmlFor="category" className="block text-sm font-medium text-gray-700 dark:text-gray-300">Kategori</label>
								<select
									id="category"
									value={categoryId}
									onChange={(e) => setCategoryId(e.target.value)}
									className="mt-1 block w-full rounded-lg border-gray-300 dark:border-gray-600 dark:bg-gray-700 dark:text-white p-3 shadow-sm focus:ring-indigo-500 focus:border-indigo-500"
									required
								>
									{categoryOptions.map((c: any) => (
										<option key={c.id} value={c.id}>{c.name}</option>
									))}
								</select>
							</div>
						</div>
					)}
					
					<div>
						<label htmlFor="description" className="block text-sm font-medium text-gray-700 dark:text-gray-300">Açıklama (Opsiyonel)</label>
						<input
							type="text"
							id="description"
							value={description}
							onChange={(e) => setDescription(e.target.value)}
							className="mt-1 block w-full rounded-lg border-gray-300 dark:border-gray-600 dark:bg-gray-700 dark:text-white p-3 shadow-sm focus:ring-indigo-500 focus:border-indigo-500"
							placeholder="Örn: Haftalık market"
						/>
					</div>

					<button
						type="submit"
						className={`w-full p-3 rounded-lg font-semibold transition duration-150 shadow-md
						${(currentType === 'income' || (isTransferMode || isEditTransfer)) ? 'bg-indigo-600 hover:bg-indigo-700 text-white' : 'bg-red-600 hover:bg-red-700 text-white'}`}
					>
						{(isTransferMode || isEditTransfer) ? (isEditTransfer ? 'Transferi Güncelle' : 'Transferi Kaydet') : (isEdit ? 'İşlemi Güncelle' : 'İşlemi Kaydet')}
					</button>

					{isEdit && (
						<button
							type="button"
							onClick={() => handleDeleteTransaction(editTransaction)}
							className="w-full bg-red-600 text-white p-3 rounded-lg font-semibold hover:bg-red-700 transition duration-150 shadow-md mt-2"
						>
							İşlemi Sil
						</button>
					)}
					
					<button
						type="button"
						onClick={() => { setEditTransaction(null); setSelectedTransaction(null); setView('transactions'); setIsTransferMode(false); }}
						className="w-full text-gray-600 dark:text-gray-400 p-3 mt-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 transition"
					>
						İptal
					</button>
				</form>
			</div>
		);
	};

	const CategoriesView = () => {
		const [catName, setCatName] = useState(editCategory?.name || '');
		const [catType, setCatType] = useState(editCategory?.type || 'expense');
		const isEdit = !!editCategory && !editCategory.isDefault;

		const handleSubmit = (e: React.FormEvent) => {
			e.preventDefault();
			if (!catName || !catType) return;
			handleSaveCategory({ name: catName, type: catType }, isEdit);
			setEditCategory(null);
			setCatName('');
			setCatType('expense');
		};

		const handleEditClick = (category: CategoryData) => {
			if (category.isDefault) {
				setError("Varsayılan kategoriler düzenlenemez veya silinemez.");
				return;
			}
			setEditCategory(category);
			setCatName(category.name);
			setCatType(category.type);
		};

		const categorySections = [
			{ title: 'Gider Kategorileri', type: 'expense', list: categories.expense, icon: TrendingDown },
			{ title: 'Gelir Kategorileri', type: 'income', list: categories.income, icon: TrendingUp },
		];

		return (
			<div className="space-y-6">
                {/* Exchange Rates Section */}
                <div className="bg-white dark:bg-gray-800 p-6 rounded-xl shadow-lg">
                    <div className="flex justify-between items-center mb-4">
                        <h3 className="text-xl font-bold text-gray-900 dark:text-white flex items-center">
                            <RefreshCw className="w-5 h-5 mr-2 text-indigo-600" />
                            Döviz Kurları (TL Karşılığı)
                        </h3>
                        <button 
                            onClick={resetRates}
                            className="text-xs text-indigo-600 hover:text-indigo-800 underline"
                        >
                            Varsayılana Dön
                        </button>
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                        {['USD', 'EUR', 'GRAM', 'USDT'].map((currency) => (
                            <div key={currency}>
                                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                                    {currency === 'GRAM' ? 'Gram Altın' : currency}
                                </label>
                                <div className="relative rounded-md shadow-sm">
                                    <input
                                        type="number"
                                        step="0.01"
                                        value={exchangeRates[currency]}
                                        onChange={(e) => handleRateChange(currency, e.target.value)}
                                        className="block w-full rounded-lg border-gray-300 dark:border-gray-600 dark:bg-gray-700 dark:text-white pl-3 pr-10 py-2 focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm"
                                    />
                                    <div className="absolute inset-y-0 right-0 pr-3 flex items-center pointer-events-none">
                                        <span className="text-gray-500 sm:text-sm">₺</span>
                                    </div>
                                </div>
                            </div>
                        ))}
                    </div>
                </div>

                <div className="border-t border-gray-200 dark:border-gray-700"></div>

			    <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
				    <div className="lg:col-span-1 p-6 bg-white dark:bg-gray-800 rounded-xl shadow-lg h-fit">
					    <h3 className="text-xl font-bold mb-4 text-gray-900 dark:text-white">
						    {isEdit ? 'Kategori Düzenle' : 'Yeni Kategori Ekle'}
					    </h3>
					    <form onSubmit={handleSubmit} className="space-y-3">
						    <div>
							    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">Ad</label>
							    <input
								    type="text"
								    value={catName}
								    onChange={(e) => setCatName(e.target.value)}
								    className="mt-1 block w-full rounded-lg border-gray-300 dark:border-gray-600 dark:bg-gray-700 dark:text-white p-2 shadow-sm"
								    required
								    disabled={isEdit && editCategory!.isDefault}
							    />
						    </div>
						    <div>
							    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">Tip</label>
							    <select
								    value={catType}
								    onChange={(e) => setCatType(e.target.value as any)}
								    className="mt-1 block w-full rounded-lg border-gray-300 dark:border-gray-600 dark:bg-gray-700 dark:text-white p-2 shadow-sm"
								    required
								    disabled={isEdit && editCategory!.isDefault}
							    >
								    <option value="expense">Gider</option>
								    <option value="income">Gelir</option>
							    </select>
						    </div>
						    <button
							    type="submit"
							    className={`w-full p-2 rounded-lg font-semibold transition ${isEdit ? 'bg-indigo-600 hover:bg-indigo-700' : 'bg-green-600 hover:bg-green-700'} text-white`}
							    disabled={isEdit && editCategory!.isDefault}
						    >
							    {isEdit ? 'Güncelle' : 'Ekle'}
						    </button>
						    {(isEdit && !editCategory!.isDefault) && (
							    <>
								    <button
									    type="button"
									    onClick={() => handleDeleteCategory(editCategory!.id)}
									    className="w-full p-2 mt-2 rounded-lg font-semibold bg-red-600 hover:bg-red-700 text-white"
								    >
									    Sil
								    </button>
								    <button
									    type="button"
									    onClick={() => { setEditCategory(null); setCatName(''); setCatType('expense'); }}
									    className="w-full p-2 mt-2 rounded-lg font-semibold text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700"
								    >
									    İptal
								    </button>
							    </>
						    )}
					    </form>
				    </div>

				    <div className="lg:col-span-2 space-y-6">
					    {categorySections.map(section => (
						    <div key={section.type} className="p-6 bg-white dark:bg-gray-800 rounded-xl shadow-lg">
							    <h3 className="text-xl font-bold mb-4 text-gray-900 dark:text-white flex items-center">
								    <section.icon className={`w-5 h-5 mr-2 ${section.type === 'income' ? 'text-green-600' : 'text-red-600'}`} />
								    {section.title}
							    </h3>
							    <div className="space-y-2">
								    {section.list.map((cat: any) => (
									    <div 
										    key={cat.id} 
										    onClick={() => handleEditClick(cat)}
										    className={`flex justify-between items-center p-3 rounded-lg border dark:border-gray-700 cursor-pointer transition 
											    ${cat.isDefault ? 'bg-gray-50 dark:bg-gray-700 text-gray-500' : 'hover:bg-indigo-50 dark:hover:bg-gray-700'}`}
									    >
										    <span className="font-medium text-gray-800 dark:text-gray-200">
											    {cat.name}
										    </span>
										    <span className={`text-xs px-2 py-0.5 rounded-full ${cat.isDefault ? 'bg-gray-200 text-gray-600' : 'bg-indigo-100 text-indigo-600'}`}>
											    {cat.isDefault ? 'Varsayılan' : 'Özel'}
										    </span>
									    </div>
								    ))}
							    </div>
						    </div>
					    ))}
				    </div>
			    </div>
            </div>
		);
	};

	const DashboardView = () => (
		<div className="space-y-6">
			<div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
				<div className="p-5 bg-indigo-600 text-white rounded-xl shadow-lg">
					<p className="text-sm opacity-80">Toplam Bakiye (TRY Eşdeğeri)</p>
					<p className="text-3xl font-bold">{formatCurrency(netWorth)}</p>
					<Wallet className="w-6 h-6 mt-2 opacity-70" />
				</div>
				<div className="p-5 bg-emerald-600 text-white rounded-xl shadow-lg">
					<p className="text-sm opacity-80">Toplam Gelir (Tüm Zamanlar)</p>
					<p className="text-3xl font-bold">{formatCurrency(totalIncome)}</p>
					<TrendingUp className="w-6 h-6 mt-2 opacity-70" />
				</div>
				<div className="p-5 bg-rose-600 text-white rounded-xl shadow-lg">
					<p className="text-sm opacity-80">Toplam Gider (Tüm Zamanlar)</p>
					<p className="text-3xl font-bold">{formatCurrency(totalExpense)}</p>
					<TrendingDown className="w-6 h-6 mt-2 opacity-70" />
				</div>
			</div>

			<div className="p-6 bg-white dark:bg-gray-800 rounded-xl shadow-lg">
				<div className="flex justify-between items-center mb-4">
					<h2 className="text-xl font-bold text-gray-900 dark:text-white">Cüzdanlarım</h2>
					<button onClick={() => setView('wallets')} className="text-indigo-600 dark:text-indigo-400 font-medium hover:underline">
						Tüm Cüzdanları Yönet
					</button>
				</div>
				<div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
					{wallets.slice(0, 3).map(wallet => (
						<WalletCard key={wallet.id} wallet={wallet} onClick={handleWalletAction} rates={exchangeRates} />
					))}
					{wallets.length === 0 && <p className="text-gray-400 dark:text-gray-500 text-center py-4 col-span-full">Cüzdan ekleyin.</p>}
				</div>
			</div>

			<div className="p-6 bg-white dark:bg-gray-800 rounded-xl shadow-lg">
				<div className="flex justify-between items-center mb-4">
					<h2 className="text-xl font-bold text-gray-900 dark:text-white">Son İşlemler</h2>
					<button onClick={() => setView('transactions')} className="text-indigo-600 dark:text-indigo-400 font-medium hover:underline">
						Tümünü Gör
					</button>
				</div>
				<div className="space-y-2">
					{transactions.slice(0, 5).map(tx => (
						<TransactionItem key={tx.id} transaction={tx} onClick={handleTransactionAction} />
					))}
					{transactions.length === 0 && <p className="text-gray-400 dark:text-gray-500 text-center py-4">Henüz bir işlem yok. Başlamak için '+' butonuna basın.</p>}
				</div>
			</div>
		</div>
	);

	const WalletsView = () => (
		<div className="space-y-4">
			<button
				onClick={() => { setEditWallet(null); setView('add-wallet'); }}
				className="w-full bg-green-600 text-white p-3 rounded-xl font-semibold hover:bg-green-700 transition duration-150 shadow-md flex items-center justify-center space-x-2"
			>
				<Plus className="w-5 h-5" />
				<span>Yeni Cüzdan Ekle</span>
			</button>
			<div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
				{wallets.map(wallet => (
					<WalletCard 
                        key={wallet.id} 
                        wallet={wallet} 
                        onClick={handleWalletAction} 
                        isSelected={filteredWalletId === wallet.id && view === 'transactions'} 
                        rates={exchangeRates}
                    />
				))}
				{wallets.length === 0 && (
					<div className="col-span-full p-8 text-center bg-gray-50 dark:bg-gray-700 rounded-lg">
						<AlertTriangle className="w-10 h-10 text-yellow-500 mx-auto mb-2" />
						<p className="text-gray-600 dark:text-gray-300">Henüz cüzdanınız yok. Lütfen yeni bir cüzdan ekleyin.</p>
					</div>
				)}
			</div>
		</div>
	);

	const mainContent = useMemo(() => {
		if (loading) {
			return (
				<div className="flex justify-center items-center h-64">
					<Loader className="w-8 h-8 text-indigo-600 animate-spin" />
					<p className="ml-3 text-gray-600 dark:text-gray-300">Veriler yükleniyor...</p>
				</div>
			);
		}

		if (!userId && !loading && db) {
			return (
				<div className="flex justify-center items-center h-64 p-4 text-center">
					<AlertTriangle className="w-8 h-8 text-red-500" />
					<p className="ml-3 text-red-600 dark:text-red-400">Giriş yapılamadı. Uygulama, anonim olarak veya token ile başlatılıyor. Verileriniz kaydedilmiyor olabilir.</p>
				</div>
			);
		}

		switch (view) {
			case 'dashboard':
				return <DashboardView />;
			case 'wallets':
				return <WalletsView />;
			case 'add-wallet':
				return <WalletForm />;
			case 'add-transaction':
				return <TransactionForm 
					wallets={wallets} 
					categories={categories} 
					isTransferMode={isTransferMode} 
					setIsTransferMode={setIsTransferMode} 
				/>;
			case 'categories':
				return <CategoriesView />;
			case 'transactions':
				return (
					<TransactionsList
						transactions={transactions}
						wallets={wallets}
						onEdit={handleTransactionAction}
						filteredWalletId={filteredWalletId}
						onClearFilter={() => setFilteredWalletId('all')}
					/>
				);
			default:
				return <DashboardView />;
		}
	}, [view, loading, userId, transactions, wallets, categories, netWorth, totalIncome, totalExpense, filteredWalletId, isTransferMode, db, exchangeRates]);
    
    const handleNavigationClick = (newView: string) => {
        setView(newView);
        setFilteredWalletId('all');
        setIsMobileMenuOpen(false);
    };

	// --- UI Structure ---
	return (
		<div className="min-h-screen bg-gray-100 dark:bg-gray-900 text-gray-900 dark:text-white pb-24 sm:pb-24">
			
            {/* Top Header - Logo Only */}
            <header className="sticky top-0 bg-white dark:bg-gray-800 shadow-sm z-10 h-16 flex items-center justify-center px-4">
                <span className="text-2xl font-extrabold text-indigo-600 tracking-wider">finata</span>
            </header>

			<div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
				{error && (
					<div className="bg-red-100 border-l-4 border-red-500 text-red-700 p-4 mb-4 rounded-lg flex justify-between items-center">
						<p className="font-semibold">{error}</p>
						<button onClick={() => setError(null)}><X className="w-5 h-5" /></button>
					</div>
				)}
				<main>{mainContent}</main>
			</div>

            {/* Bottom Navigation Bar */}
            <nav className="fixed bottom-0 left-0 right-0 bg-white dark:bg-gray-800 shadow-[0_-4px_6px_-1px_rgba(0,0,0,0.1)] z-30 h-16 flex justify-around items-center px-2">
                <button 
                    onClick={() => handleNavigationClick('dashboard')} 
                    className={`flex flex-col items-center justify-center w-full h-full space-y-1 ${view === 'dashboard' ? 'text-indigo-600 dark:text-indigo-400' : 'text-gray-500 dark:text-gray-400'}`}
                >
                    <LayoutDashboard className="w-6 h-6" />
                    <span className="text-xs font-medium">Kontrol Paneli</span>
                </button>
                <button 
                    onClick={() => handleNavigationClick('wallets')} 
                    className={`flex flex-col items-center justify-center w-full h-full space-y-1 ${view === 'wallets' ? 'text-indigo-600 dark:text-indigo-400' : 'text-gray-500 dark:text-gray-400'}`}
                >
                    <Wallet className="w-6 h-6" />
                    <span className="text-xs font-medium">Cüzdanlar</span>
                </button>
                <button 
                    onClick={() => handleNavigationClick('transactions')} 
                    className={`flex flex-col items-center justify-center w-full h-full space-y-1 ${view === 'transactions' ? 'text-indigo-600 dark:text-indigo-400' : 'text-gray-500 dark:text-gray-400'}`}
                >
                    <List className="w-6 h-6" />
                    <span className="text-xs font-medium">İşlemler</span>
                </button>
                <button 
                    onClick={() => handleNavigationClick('categories')} 
                    className={`flex flex-col items-center justify-center w-full h-full space-y-1 ${view === 'categories' ? 'text-indigo-600 dark:text-indigo-400' : 'text-gray-500 dark:text-gray-400'}`}
                >
                    <Settings className="w-6 h-6" />
                    <span className="text-xs font-medium">Ayarlar</span>
                </button>
            </nav>

            {/* Floating Action Buttons - Lifted to avoid overlap with bottom nav */}
			<div className="fixed bottom-20 left-0 right-0 sm:bottom-24 sm:right-4 sm:left-auto p-4 sm:p-0 z-20 pointer-events-none">
				<div className="flex justify-around sm:flex-col sm:space-y-3 pointer-events-auto bg-white/80 dark:bg-gray-800/80 backdrop-blur-sm sm:bg-transparent sm:backdrop-blur-none p-2 rounded-2xl sm:p-0">
					<button 
						onClick={() => startTransactionFlow('income')} 
						className="p-3 sm:p-4 bg-emerald-600 hover:bg-emerald-700 text-white rounded-full shadow-lg transition duration-200 flex flex-col items-center sm:flex-row space-x-1"
					>
						<Plus className="w-6 h-6" />
						<span className="hidden sm:inline">Gelir</span>
					</button>
					<button 
						onClick={() => startTransactionFlow('expense')} 
						className="p-3 sm:p-4 bg-rose-600 hover:bg-rose-700 text-white rounded-full shadow-lg transition duration-200 flex flex-col items-center sm:flex-row space-x-1"
					>
						<Send className="w-6 h-6 transform rotate-90" />
						<span className="hidden sm:inline">Gider</span>
					</button>
					<button 
						onClick={() => startTransferFlow()} 
						className="p-3 sm:p-4 bg-indigo-600 hover:bg-indigo-700 text-white rounded-full shadow-lg transition duration-200 flex flex-col items-center sm:flex-row space-x-1"
					>
						<Repeat className="w-6 h-6" />
						<span className="hidden sm:inline">Transfer</span>
					</button>
				</div>
			</div>

			{selectedWallet && (
				<ActionMenu
					title={`${selectedWallet.name} Aksiyonlar`}
					onClose={() => setSelectedWallet(null)}
				>
					<ActionMenuItem
						icon={List}
						label="İşlemleri Gör"
						onClick={() => handleViewWalletTransactions(selectedWallet.id)}
						color="text-green-600"
					/>
					
					<ActionMenuItem
						icon={TrendingUp}
						label="Gelir Ekle"
						onClick={() => startTransactionFlow('income', selectedWallet.id)}
						color="text-emerald-600"
					/>
					<ActionMenuItem
						icon={TrendingDown}
						label="Gider Ekle"
						onClick={() => startTransactionFlow('expense', selectedWallet.id)}
						color="text-rose-600"
					/>
					<ActionMenuItem
						icon={Repeat}
						label="Transfer Başlat"
						onClick={() => startTransferFlow(selectedWallet.id)}
						color="text-indigo-600"
					/>
					<div className="border-t border-gray-100 dark:border-gray-700 my-2"></div>
					<ActionMenuItem
						icon={Edit}
						label="Cüzdanı Düzenle"
						onClick={() => startEditWallet(selectedWallet)}
						color="text-gray-600"
					/>
				</ActionMenu>
			)}

			{selectedTransaction && (
				<ActionMenu
					title={`${selectedTransaction.type === 'transfer' ? 'Transfer' : selectedTransaction.categoryName} Detay`}
					onClose={() => setSelectedTransaction(null)}
				>
					<ActionMenuItem
						icon={Edit}
						label="Düzenle"
						onClick={() => {
							if (selectedTransaction.type === 'transfer') {
								setEditTransaction(selectedTransaction);
								setIsTransferMode(true);
								setTransactionType(null);
								setView('add-transaction');
							} else {
								setEditTransaction(selectedTransaction);
								setTransactionType(selectedTransaction.type);
								setView('add-transaction');
							}
							setSelectedTransaction(null);
						}}
						color="text-indigo-600"
					/>
					<ActionMenuItem
						icon={Copy}
						label="Kopyala"
						onClick={() => handleCopyTransaction(selectedTransaction)}
						color="text-amber-600"
					/>
					<ActionMenuItem
						icon={Trash2}
						label="Sil"
						onClick={() => handleDeleteTransaction(selectedTransaction)}
						color="text-red-600"
					/>
				</ActionMenu>
			)}
		</div>
	);
};

export default App;