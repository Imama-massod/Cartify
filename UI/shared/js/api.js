const API_BASE_URL = 'http://localhost:5000/api';

// Core Fetch Wrapper
async function apiFetch(endpoint, options = {}) {
    const token = localStorage.getItem('cartify_token');
    
    const defaultHeaders = {
        'Content-Type': 'application/json',
        'Accept': 'application/json'
    };

    if (token) {
        defaultHeaders['Authorization'] = `Bearer ${token}`;
    }

    // Handle FormData where Context-Type is set automatically by the Browser
    if (options.body instanceof FormData) {
        delete defaultHeaders['Content-Type'];
    }

    const config = {
        ...options,
        headers: {
            ...defaultHeaders,
            ...options.headers
        }
    };

    try {
        const response = await fetch(`${API_BASE_URL}${endpoint}`, config);
        const data = await response.json();
        
        if (!response.ok) {
            // Unauthenticated intercept
            if (response.status === 401) {
                console.warn('Unauthorized. Token might be expired.');
                localStorage.removeItem('cartify_token');
                localStorage.removeItem('cartify_user');
                // Redirect to login eventually
            }
            throw new Error(data.message || 'Something went wrong');
        }
        
        return data;
    } catch (error) {
        console.error('API Error:', error);
        throw error;
    }
}

// Global UI Helpers
function showToast(message, type = 'success') {
    // A simple toast notification system
    const toast = document.createElement('div');
    toast.style.position = 'fixed';
    toast.style.bottom = '20px';
    toast.style.right = '20px';
    toast.style.backgroundColor = type === 'success' ? '#FFD100' : '#E63946';
    toast.style.color = type === 'success' ? '#1B365D' : '#FFF';
    toast.style.padding = '15px 25px';
    toast.style.borderRadius = '8px';
    toast.style.fontWeight = 'bold';
    toast.style.boxShadow = '0 4px 12px rgba(0,0,0,0.15)';
    toast.style.zIndex = '9999';
    toast.style.transition = 'all 0.3s ease';
    toast.innerText = message;
    
    document.body.appendChild(toast);
    
    setTimeout(() => {
        toast.style.opacity = '0';
        toast.style.transform = 'translateY(20px)';
        setTimeout(() => toast.remove(), 300);
    }, 3000);
}


async function updateCartBadge() {
    const token = localStorage.getItem('cartify_token');
    // Only fetch if user is logged in
    if (!token) {
        _setCartBadge(0);
        return;
    }
    try {
        const res = await apiFetch('/cart');
        if (res.success && res.data) {
            // Sum up quantities of all items
            const totalQty = res.data.reduce((sum, item) => sum + (item.quantity || 1), 0);
            _setCartBadge(totalQty);
        }
    } catch (e) {
        // Silently fail — badge stays at 0
        _setCartBadge(0);
    }
}

function _setCartBadge(count) {
    // Update any element with id="cartCount" or class="cart-badge"
    const byId = document.getElementById('cartCount');
    if (byId) {
        byId.innerText = count;
        byId.style.display = count > 0 ? 'flex' : 'flex'; // always visible
    }
    document.querySelectorAll('.cart-badge').forEach(el => {
        el.innerText = count;
    });
}

// Ensure Auth State is reflected globally on loaded pages
document.addEventListener('DOMContentLoaded', () => {
    const userJson = localStorage.getItem('cartify_user');
    const authLinks = document.getElementById('authLinks');
    
    if (userJson && authLinks) {
        const user = JSON.parse(userJson);
        authLinks.innerHTML = `
            <a href="${user.role === 'admin' ? '../admin/index.html' : 'profile.html'}" style="font-weight: 700; color: var(--accent-yellow)">
               <i class="fa fa-user"></i> Hi, ${user.name.split(' ')[0]}!
            </a>
            <a href="#" onclick="logout(event)"><i class="fa fa-sign-out"></i> Logout</a>
        `;
    }

    // Auto-update cart badge on every page load
    updateCartBadge();
    updateWishlistBadge();
});

function logout(e) {
    if (e) e.preventDefault();
    localStorage.removeItem('cartify_token');
    localStorage.removeItem('cartify_user');
    window.location.reload();
}

window.apiFetch = apiFetch;
window.showToast = showToast;
window.updateCartBadge = updateCartBadge;

// ============================================================
// WISHLIST BADGE — updates heart icon count on every page
// ============================================================
async function updateWishlistBadge() {
    const token = localStorage.getItem('cartify_token');
    if (!token) { _setWishlistBadge(0); return; }
    try {
        const res = await apiFetch('/wishlist');
        if (res.success && res.data) {
            _setWishlistBadge(res.data.length);
        }
    } catch (e) {
        _setWishlistBadge(0);
    }
}

function _setWishlistBadge(count) {
    const el = document.getElementById('wishlistCount');
    if (el) el.innerText = count;
}

window.updateWishlistBadge = updateWishlistBadge;
