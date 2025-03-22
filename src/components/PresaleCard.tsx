import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  Box, Button, Text, Heading, Divider, Stack, Switch,
  Alert, AlertIcon,
  useToast, Flex
} from '@chakra-ui/react';
import { ethers } from 'ethers';
import styled from '@emotion/styled';

// ABI for the presale contract
const PRESALE_ABI = [
  "function buyTokensWithETH() payable",
  "function contributions(address user) view returns (uint256)",
  "function presaleActive() view returns (bool)",
  "function totalRaised() view returns (uint256)",
  "function owner() view returns (address)",
  "function togglePresale()",
  "function withdrawFunds()",
  "function emergencyWithdraw()"
];

// Contract addresses
const DOGECAT_ADDRESS = "0x72bFf9b300Fc8A501Ec268d9787501D8B379024B"; // DOGECAT Token address
const PRESALE_ADDRESS = "0x84329499Da92F02C1efe9f335e0Aa166461c3549"; // New presale contract address

// Presale configuration from the smart contract
const PRESALE_CONFIG = {
  rate: 1000,              // 1000 DOGECAT per ETH
  minContribution: "0.0166", // Min contribution in ETH (~$50)
  maxContribution: "0.166", // Max contribution in ETH (~$500)
  hardCap: "10",          // Hard cap in ETH
  softCap: "3",           // Soft cap in ETH
  liquidityWallet: "0x575c9e85592cDD7D17a3ea57cfA839E4256e0dFB",
  treasuryWallet: "0x146D8294097022363f4160580239c5c69749EC51",
  taxRate: 3,             // 3% tax on transfers
};

// Styled components
const CardContainer = styled.div`
  max-width: 500px;
  margin: 0 auto;
  margin-bottom: 1.5rem;
`;

const Card = styled.div`
  background-color: white;
  border-radius: 16px;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.08);
  padding: 24px;
  margin-bottom: 24px;
`;

const CustomInput = styled.input`
  width: 100%;
  padding: 10px 14px;
  border-radius: 8px;
  border: 1px solid #E2E8F0;
  font-size: 16px;
  transition: all 0.2s;
  
  &:focus {
    outline: none;
    border-color: #3182CE;
    box-shadow: 0 0 0 1px #3182CE;
  }
  
  &::placeholder {
    color: #A0AEC0;
  }
`;

// For direct DOM manipulation (maintaining cursor position)
const initializeInputHandler = () => {
  if (typeof document !== 'undefined') {
    setTimeout(() => {
      const inputElement = document.getElementById('eth-input');
      const tokenDisplay = document.getElementById('token-display');
      
      if (inputElement && tokenDisplay) {
        inputElement.addEventListener('input', function(e) {
          const target = e.target as HTMLInputElement;
          const value = target.value;
          
          // Calculate tokens
          let tokenAmount = '0';
          if (value && !isNaN(parseFloat(value))) {
            const ethAmount = parseFloat(value);
            const rawTokens = ethAmount * 1000; // 1000 DOGECAT per ETH
            const taxAmount = rawTokens * 0.03; // 3% tax
            const netTokens = rawTokens - taxAmount;
            tokenAmount = netTokens.toLocaleString(undefined, {
              maximumFractionDigits: 2
            });
          }
          
          // Update token display
          tokenDisplay.textContent = tokenAmount + ' DOGECAT';
        });
      }
    }, 500);
  }
};

// Main PresaleCard component
const PresaleCard: React.FC = () => {
  // Wallet states
  const [isWalletConnected, setIsWalletConnected] = useState(false);
  const [isWalletInstalled, setIsWalletInstalled] = useState(true);
  const [account, setAccount] = useState<string | null>(null);
  
  // Contract states
  const [presaleContract, setPresaleContract] = useState<any>(null);
  const [signer, setSigner] = useState<any>(null);
  const [presaleActive, setPresaleActive] = useState(false);
  const [totalContributed, setTotalContributed] = useState('0');
  const [userContribution, setUserContribution] = useState('0');
  
  // Admin states
  const [isOwner, setIsOwner] = useState(false);
  
  // UI states
  const [loading, setLoading] = useState(false);
  const [adminLoading, setAdminLoading] = useState(false);
  const [tokensToReceive, setTokensToReceive] = useState('0');
  const [ethAmount, setEthAmount] = useState<string>(''); // Add type annotation
  
  // Refs
  const inputRef = useRef<HTMLInputElement>(null);
  
  // Toast notifications instead of alerts
  const toast = useToast();
  
  // Initialize input handler for vanilla DOM manipulation
  useEffect(() => {
    initializeInputHandler();
  }, []);

  // Check for Ethereum wallet on load
  useEffect(() => {
    const checkWallet = async () => {
      if (typeof window !== 'undefined' && (window as any).ethereum) {
        setIsWalletInstalled(true);
        
        // Check if already connected
        try {
          const provider = new ethers.providers.Web3Provider((window as any).ethereum);
          const accounts = await provider.listAccounts();
          
          if (accounts.length > 0) {
            await connectWallet();
          }
        } catch (error) {
          console.error("Error checking connected accounts:", error);
        }
      } else {
        setIsWalletInstalled(false);
      }
    };
    
    checkWallet();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Connect wallet function with account selector
  const connectWallet = async (forceAccountSelect = false) => {
    try {
      setLoading(true);
      
      // Reset owner status when connecting a new wallet
      setIsOwner(false);
      
      if (typeof window === 'undefined' || !(window as any).ethereum) {
        throw new Error("Ethereum wallet not detected");
      }
      
      const provider = new ethers.providers.Web3Provider((window as any).ethereum);
      let accounts = [];
      
      try {
        // Force MetaMask to show the account selection modal if requested
        if (forceAccountSelect && (window as any).ethereum.isMetaMask) {
          await (window as any).ethereum.request({
            method: 'wallet_requestPermissions',
            params: [{ eth_accounts: {} }]
          });
        }
        
        // Request accounts
        accounts = await provider.send("eth_requestAccounts", []);
      } catch (error) {
        console.error("Account selection error:", error);
        // Fallback to standard request
        accounts = await provider.send("eth_requestAccounts", []);
      }
      
      if (accounts.length === 0) {
        throw new Error("No accounts found");
      }
      
      const signer = provider.getSigner();
      setSigner(signer);
      setAccount(accounts[0]);
      setIsWalletConnected(true);
      
      try {
        // Initialize presale contract
        const contract = new ethers.Contract(PRESALE_ADDRESS, PRESALE_ABI, signer);
        setPresaleContract(contract);
        
        // Fetch actual data from the contract
        try {
          await fetchPresaleData(contract, accounts[0]);
        } catch (error) {
          console.error("Error fetching presale data:", error);
          setIsOwner(false); // Ensure owner status is false if there's an error
        }
      } catch (error) {
        console.error("Contract initialization error:", error);
        setIsOwner(false); // Ensure owner status is false if there's an error
      }
    } catch (error: any) {
      console.error("Wallet connection error:", error);
      toast({
        title: "Connection Error",
        description: error.message || "Could not connect to wallet",
        status: "error",
        duration: 3000,
        isClosable: true,
      });
    } finally {
      setLoading(false);
    }
  };

  // Fetch data from the presale contract
  const fetchPresaleData = useCallback(async (contract = presaleContract, userAddress = account) => {
    if (!contract || !userAddress) return;
    
    try {
      // Reset owner status first
      setIsOwner(false);
      
      // Get presale state
      const active = await contract.presaleActive();
      setPresaleActive(active);
      
      // Get total raised
      const raised = await contract.totalRaised();
      setTotalContributed(ethers.utils.formatEther(raised));
      
      // Get user contribution
      const contribution = await contract.contributions(userAddress);
      setUserContribution(ethers.utils.formatEther(contribution));
      
      // Check if user is owner
      try {
        const owner = await contract.owner();
        setIsOwner(owner.toLowerCase() === userAddress.toLowerCase());
      } catch (error) {
        console.error("Error checking owner:", error);
        setIsOwner(false);
      }
    } catch (error) {
      console.error("Error fetching presale data:", error);
      toast({
        title: "Error",
        description: "Failed to fetch presale data",
        status: "error",
        duration: 3000,
        isClosable: true,
      });
    }
  }, [presaleContract, account]);

  // Listen for account changes
  useEffect(() => {
    if (typeof window === 'undefined' || !(window as any).ethereum) return;
    
    const handleAccountsChanged = async (accounts: string[]) => {
      if (accounts.length === 0) {
        // User disconnected wallet
        setAccount(null);
        setIsWalletConnected(false);
      } else if (accounts[0] !== account) {
        // Account changed
        setAccount(accounts[0]);
        
        if (presaleContract) {
          await fetchPresaleData(presaleContract, accounts[0]);
        }
      }
    };
    
    (window as any).ethereum.on('accountsChanged', handleAccountsChanged);
    
    return () => {
      (window as any).ethereum.removeListener('accountsChanged', handleAccountsChanged);
    };
  }, [presaleContract, account, fetchPresaleData]);

  // Refresh data periodically
  useEffect(() => {
    if (!presaleContract || !account) return;
    
    const interval = setInterval(() => {
      fetchPresaleData();
    }, 30000); // Every 30 seconds
    
    return () => clearInterval(interval);
  }, [presaleContract, account, fetchPresaleData]); 

  // Calculate tokens based on ETH amount
  const calculateTokens = (ethAmount: string): string => {
    if (!ethAmount || isNaN(parseFloat(ethAmount))) {
      return '0';
    }
    
    const amount = parseFloat(ethAmount);
    const rawTokens = amount * PRESALE_CONFIG.rate;
    const taxAmount = rawTokens * (PRESALE_CONFIG.taxRate / 100);
    const netTokens = rawTokens - taxAmount;
    
    return netTokens.toString();
  };

  // Handle input change (maintains cursor position)
  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value;
    setEthAmount(value);
    const tokens = calculateTokens(value);
    setTokensToReceive(tokens);
  };

  // Format number with commas
  const formatNumber = (value: string) => {
    if (!value) return '0';
    const num = parseFloat(value);
    return num.toLocaleString(undefined, {
      maximumFractionDigits: 2
    });
  };

  // Handle contribution submission
  const handleContribute = async () => {
    if (!presaleContract || !signer) {
      toast({
        title: "Error",
        description: "Wallet not connected properly",
        status: "error",
        duration: 3000,
        isClosable: true,
      });
      return;
    }
    
    // Get input value
    if (!ethAmount || isNaN(parseFloat(ethAmount))) {
      toast({
        title: "Invalid Amount",
        description: "Please enter a valid ETH amount",
        status: "error",
        duration: 3000,
        isClosable: true,
      });
      return;
    }
    
    const ethValue = parseFloat(ethAmount);
    const minContribution = parseFloat(PRESALE_CONFIG.minContribution);
    const maxContribution = parseFloat(PRESALE_CONFIG.maxContribution);
    
    // Validate min/max contribution
    if (ethValue < minContribution) {
      toast({
        title: "Contribution Too Low",
        description: `Minimum contribution is ${PRESALE_CONFIG.minContribution} ETH`,
        status: "warning",
        duration: 3000,
        isClosable: true,
      });
      return;
    }
    
    if (ethValue > maxContribution) {
      toast({
        title: "Contribution Too High",
        description: `Maximum contribution is ${PRESALE_CONFIG.maxContribution} ETH`,
        status: "warning",
        duration: 3000,
        isClosable: true,
      });
      return;
    }
    
    setLoading(true);
    
    try {
      // Convert to wei
      const weiAmount = ethers.utils.parseEther(ethAmount);
      
      // Check user's balance before trying to send transaction
      const balance = await signer.getBalance();
      
      if (balance.lt(weiAmount)) {
        toast({
          title: "Insufficient Funds",
          description: `You don't have enough ETH in your wallet. You need at least ${ethAmount} ETH plus gas fees.`,
          status: "error",
          duration: 5000,
          isClosable: true,
        });
        return;
      }
      
      // For demo/testing purposes, just simulate the transaction success
      if (PRESALE_ADDRESS.includes("123456789")) {
        // This is a placeholder contract, just simulate success
        await new Promise(resolve => setTimeout(resolve, 1000)); // Simulate transaction delay
        
        toast({
          title: "Demo Mode",
          description: "This is running in demo mode with a placeholder contract. Real transactions aren't processed.",
          status: "info",
          duration: 5000,
          isClosable: true,
        });
        
        // Update UI as if transaction succeeded
        const newContribution = (parseFloat(userContribution) + ethValue).toString();
        setUserContribution(newContribution);
        const newTotal = (parseFloat(totalContributed) + ethValue).toString();
        setTotalContributed(newTotal);
        
        // Reset input
        setEthAmount('');
        setTokensToReceive('0');
        
        toast({
          title: "Contribution Simulated",
          description: `Simulated contribution of ${ethAmount} ETH to the DOGECAT presale`,
          status: "success",
          duration: 3000,
          isClosable: true,
        });
        
        return;
      }
      
      // Only continue with real transaction if not in demo mode
      // Send transaction
      const tx = await presaleContract.buyTokensWithETH({
        value: weiAmount
      });
      
      // Wait for transaction to be mined
      await tx.wait();
      
      // Show success message
      toast({
        title: "Contribution Successful",
        description: `You have contributed ${ethAmount} ETH to the DOGECAT presale`,
        status: "success",
        duration: 5000,
        isClosable: true,
      });
      
      // Fetch updated data
      await fetchPresaleData();
      
      // Reset input
      setEthAmount('');
      setTokensToReceive('0');
    } catch (error: any) {
      console.error("Contribution error:", error);
      
      // Extract error message from ethers error
      let errorMessage = "Transaction failed";
      
      if (error.code === "INSUFFICIENT_FUNDS") {
        errorMessage = "You don't have enough ETH in your wallet for this contribution plus gas fees";
      } else if (error.message && error.message.includes("user rejected")) {
        errorMessage = "Transaction was rejected in your wallet";
      } else if (error.error && error.error.message) {
        errorMessage = error.error.message;
      } else if (error.reason) {
        errorMessage = error.reason;
      } else if (error.message) {
        errorMessage = error.message;
      }
      
      toast({
        title: "Contribution Failed",
        description: errorMessage,
        status: "error",
        duration: 5000,
        isClosable: true,
      });
    } finally {
      setLoading(false);
    }
  };

  // Disconnect wallet function
  const disconnectWallet = () => {
    // Reset all states
    setAccount(null);
    setIsWalletConnected(false);
    setSigner(null);
    setPresaleContract(null);
    setPresaleActive(false);
    setTotalContributed('0');
    setUserContribution('0');
    setIsOwner(false);
    setEthAmount('');
    setTokensToReceive('0');
    
    // Clear any stored provider connections if possible
    if (typeof window !== 'undefined' && (window as any).ethereum) {
      // Some wallets support this method to forget the previous connection
      try {
        if ((window as any).ethereum.isMetaMask) {
          // For MetaMask - nothing to do here as it doesn't have a proper disconnect
          // We'll force the account selector on next connect
        }
      } catch (error) {
        console.error("Error during wallet disconnection:", error);
      }
    }
    
    toast({
      title: "Wallet Disconnected",
      description: "You have disconnected your wallet. Connect a different wallet to continue.",
      status: "success",
      duration: 3000,
      isClosable: true,
    });
  };

  // Admin functions
  const togglePresaleStatus = async () => {
    if (!presaleContract || !isOwner) {
      toast({
        title: "Permission Denied",
        description: "Only the contract owner can change presale status",
        status: "error",
        duration: 5000,
        isClosable: true,
      });
      return;
    }
    
    setAdminLoading(true);
    
    try {
      const tx = await presaleContract.togglePresale();
      await tx.wait();
      
      await fetchPresaleData();
      
      toast({
        title: "Presale Status Updated",
        description: `Presale is now ${!presaleActive ? 'active' : 'inactive'}`,
        status: "success",
        duration: 5000,
        isClosable: true,
      });
    } catch (error: any) {
      console.error("Error toggling presale:", error);
      toast({
        title: "Action Failed",
        description: error.message || "Failed to toggle presale status",
        status: "error",
        duration: 5000,
        isClosable: true,
      });
    } finally {
      setAdminLoading(false);
    }
  };

  const withdrawFunds = async () => {
    if (!presaleContract || !isOwner) {
      toast({
        title: "Permission Denied",
        description: "Only the contract owner can withdraw funds",
        status: "error",
        duration: 5000,
        isClosable: true,
      });
      return;
    }
    
    setAdminLoading(true);
    
    try {
      const tx = await presaleContract.withdrawFunds();
      await tx.wait();
      
      await fetchPresaleData();
      
      toast({
        title: "Withdrawal Successful",
        description: "Funds have been withdrawn to owner address",
        status: "success",
        duration: 5000,
        isClosable: true,
      });
    } catch (error: any) {
      console.error("Withdrawal error:", error);
      toast({
        title: "Withdrawal Failed",
        description: error.message || "Failed to withdraw funds",
        status: "error",
        duration: 5000,
        isClosable: true,
      });
    } finally {
      setAdminLoading(false);
    }
  };

  const emergencyWithdraw = async () => {
    if (!presaleContract || !isOwner) {
      toast({
        title: "Permission Denied",
        description: "Only the contract owner can perform emergency withdrawal",
        status: "error",
        duration: 5000,
        isClosable: true,
      });
      return;
    }
    
    setAdminLoading(true);
    
    try {
      const tx = await presaleContract.emergencyWithdraw();
      await tx.wait();
      
      await fetchPresaleData();
      
      toast({
        title: "Emergency Withdrawal Complete",
        description: "All funds have been withdrawn to owner address",
        status: "success",
        duration: 5000,
        isClosable: true,
      });
    } catch (error: any) {
      console.error("Emergency withdrawal error:", error);
      toast({
        title: "Action Failed",
        description: error.message || "Failed to perform emergency withdrawal",
        status: "error",
        duration: 5000,
        isClosable: true,
      });
    } finally {
      setAdminLoading(false);
    }
  };

  // Wallet installation prompt
  if (!isWalletInstalled) {
    return (
      <CardContainer>
        <Card>
          <Heading size="md" mb={4}>DOGECAT Presale</Heading>
          <Text mb={4}>
            Ethereum wallet not detected. Please install Metamask or another Ethereum wallet to participate in the presale.
          </Text>
          <Button 
            as="a" 
            href="https://metamask.io/" 
            target="_blank" 
            colorScheme="blue"
            width="100%"
          >
            Get Metamask
          </Button>
        </Card>
      </CardContainer>
    );
  }

  // Connect wallet prompt
  if (!isWalletConnected) {
    return (
      <CardContainer>
        <Card>
          <Heading size="md" mb={4}>DOGECAT Presale</Heading>
          <Text mb={4}>
            Connect your wallet to participate in the DOGECAT token presale.
          </Text>
          <Button 
            onClick={() => connectWallet(true)} 
            colorScheme="blue" 
            isLoading={loading}
            width="100%"
            size="lg"
            mb={2}
          >
            Connect Wallet
          </Button>
          <Text fontSize="xs" color="gray.500" textAlign="center">
            Min: {PRESALE_CONFIG.minContribution} ETH | Max: {PRESALE_CONFIG.maxContribution} ETH
          </Text>
        </Card>
      </CardContainer>
    );
  }

  // Admin panel component
  const AdminPanel = () => {
    if (!isOwner) return null;
    
    return (
      <Card>
        <Heading size="md" mb={4}>Admin Panel</Heading>
        
        <Stack spacing={4}>
          <Box display="flex" alignItems="center" justifyContent="space-between">
            <Text fontWeight="bold">Presale Status:</Text>
            <Box display="flex" alignItems="center">
              <Text mr={2} color={presaleActive ? "green.500" : "red.500"}>
                {presaleActive ? 'Active' : 'Inactive'}
              </Text>
              <Switch 
                isChecked={presaleActive} 
                onChange={togglePresaleStatus}
                isDisabled={adminLoading}
              />
            </Box>
          </Box>
          
          <Box>
            <Text fontWeight="bold" mb={2}>Total Raised:</Text>
            <Text>{formatNumber(totalContributed)} ETH</Text>
            <Text fontSize="xs" color="gray.500" mt={1}>
              Hard Cap: {PRESALE_CONFIG.hardCap} ETH | Soft Cap: {PRESALE_CONFIG.softCap} ETH
            </Text>
            
            {/* Progress bar */}
            <Box mt={2} bg="gray.100" h="8px" borderRadius="full" overflow="hidden">
              <Box 
                bg={parseFloat(totalContributed) >= parseFloat(PRESALE_CONFIG.softCap) ? "green.400" : "blue.400"}
                h="100%" 
                w={`${Math.min((parseFloat(totalContributed) / parseFloat(PRESALE_CONFIG.hardCap)) * 100, 100)}%`}
                transition="width 0.5s"
              />
            </Box>
            
            {parseFloat(totalContributed) >= parseFloat(PRESALE_CONFIG.softCap) && (
              <Text fontSize="xs" color="green.500" mt={1}>
                Soft cap reached! Funds can now be withdrawn.
              </Text>
            )}
          </Box>
          
          <Divider />
          
          <Box>
            <Button 
              colorScheme="blue" 
              width="100%" 
              mb={2}
              onClick={withdrawFunds}
              isLoading={adminLoading}
              loadingText="Processing..."
              isDisabled={parseFloat(totalContributed) < parseFloat(PRESALE_CONFIG.softCap)}
            >
              Withdraw Funds
            </Button>
            <Text fontSize="xs" color="gray.500" textAlign="center">
              Only available after soft cap is reached
            </Text>
          </Box>
          
          <Box>
            <Button 
              colorScheme="red" 
              variant="outline" 
              width="100%"
              onClick={emergencyWithdraw}
              isLoading={adminLoading}
              loadingText="Processing..."
            >
              Emergency Withdraw
            </Button>
          </Box>
        </Stack>
      </Card>
    );
  };

  // Main presale card (when wallet connected)
  return (
    <CardContainer>
      <Card>
        <Flex justifyContent="space-between" alignItems="center" mb={4}>
          <Heading size="md">DOGECAT Presale</Heading>
          {isWalletConnected && (
            <Button 
              onClick={disconnectWallet} 
              colorScheme="red" 
              variant="outline" 
              size="sm"
            >
              Change Wallet
            </Button>
          )}
        </Flex>
        
        <Box mb={4}>
          <Box mb={3}>
            <Text fontWeight="bold" fontSize="sm">Account:</Text>
            <Text fontSize="sm" color="gray.600">{account}</Text>
          </Box>
          
          <Box mb={3}>
            <Text fontWeight="bold" fontSize="sm">Your Contribution:</Text>
            <Text fontSize="sm" color="gray.600">{formatNumber(userContribution)} ETH</Text>
          </Box>
          
          <Box mb={3}>
            <Text fontWeight="bold" fontSize="sm">Total Raised:</Text>
            <Text fontSize="sm" color="gray.600">{formatNumber(totalContributed)} ETH</Text>
          </Box>
          
          <Box>
            <Text fontWeight="bold" fontSize="sm">Presale Status:</Text>
            <Text 
              fontSize="sm" 
              fontWeight="medium"
              color={presaleActive ? "green.500" : "red.500"}
            >
              {presaleActive ? 'Active' : 'Inactive'}
            </Text>
          </Box>
        </Box>
        
        {presaleActive ? (
          <>
            <Divider mb={4} />
            
            <Heading size="sm" mb={4}>Contribute to Presale</Heading>
            
            <Box mb={4}>
              <Text mb={2} fontSize="sm">Payment Method: ETH (Ethereum)</Text>
              
              {/* Uncontrolled input using ref */}
              <CustomInput
                id="eth-input"
                ref={inputRef}
                placeholder="Amount (ETH)"
                onChange={handleInputChange}
                type="text"
                value={ethAmount}
              />
            </Box>
            
            <Box 
              p={3} 
              bg="blue.50" 
              borderRadius="md" 
              mb={4}
            >
              <Text fontSize="sm" fontWeight="medium" mb={1}>
                You will receive:
              </Text>
              <Text id="token-display" fontSize="lg" fontWeight="bold">
                {formatNumber(tokensToReceive)} DOGECAT
              </Text>
              <Text fontSize="xs" color="gray.500" mt={1}>
                ({PRESALE_CONFIG.taxRate}% tax applied)
              </Text>
            </Box>
            
            <Flex width="100%" mt={4} direction="column">
              <Button
                onClick={handleContribute}
                colorScheme="green"
                isDisabled={!presaleActive || loading || !ethAmount || parseFloat(ethAmount) === 0}
                isLoading={loading}
                loadingText="Contributing..."
                size="lg"
                height="50px"
                width="100%"
              >
                Contribute Now
              </Button>
              <Text fontSize="xs" color="gray.500" mt={2} textAlign="center">
                {presaleActive ? 'Presale is active! You can contribute now.' : 'Presale is currently paused by admin.'}
              </Text>
            </Flex>
            
            <Text fontSize="xs" color="gray.500" textAlign="center">
              Min: {PRESALE_CONFIG.minContribution} ETH | Max: {PRESALE_CONFIG.maxContribution} ETH
            </Text>
          </>
        ) : (
          <Alert status="info" borderRadius="md" mt={4}>
            <AlertIcon />
            <Text>
              The presale is currently inactive. Please check back later.
            </Text>
          </Alert>
        )}
      </Card>
      
      {/* Render admin panel if user is the contract owner */}
      {isOwner && <AdminPanel />}
    </CardContainer>
  );
};

export default PresaleCard;
